const { v4: uuidv4 } = require('uuid');
const { createClient } = require('../common/httpClient');
const kafkaClient = require('../common/kafkaClient');
const { waitFor } = require('../common/waitFor');

const client = createClient();
const userServiceUrl = process.env.USER_SERVICE_URL || 'http://user-service:3000';

describe('Order Service - Full E2E (Sagas & Edge Cases)', () => {
  let authToken;
  let userId;

  // Helper to create a fresh order for isolated tests
  const createOrder = async (amount = 100) => {
    const res = await client.post('/api/orders', {
      items: [{ productId: 'test-p1', quantity: 1 }],
      totalAmount: amount
    }, {
      headers: { 'Authorization': `Bearer ${authToken}`, 'Idempotency-Key': uuidv4() }
    });
    return res.data.id;
  };

  beforeAll(async () => {
    await kafkaClient.connect();
    // Subscribe to events and DLQ for verification
    await kafkaClient.subscribe(['order.events', 'order.dlq']); 

    // Setup Main User
    const userEmail = `e2e-${uuidv4()}@example.com`;
    const userPass = 'E2EPass123!';
    const userClient = createClient(userServiceUrl);
    
    const regRes = await userClient.post('/api/users', {
      email: userEmail, password: userPass, firstName: 'E2E', lastName: 'User'
    });
    const loginRes = await userClient.post('/api/login', {
      email: userEmail, password: userPass
    });
    authToken = loginRes.data.token;
    userId = regRes.data.id;
  });

  afterAll(async () => {
    await kafkaClient.disconnect();
  });

  // 🟠 1. HTTP Idempotency
  it('should return cached response for duplicate HTTP idempotency key', async () => {
    const key = uuidv4();
    const payload = { items: [], totalAmount: 50 };
    const headers = { 'Authorization': `Bearer ${authToken}`, 'Idempotency-Key': key };

    const res1 = await client.post('/api/orders', payload, { headers });
    expect(res1.status).toBe(201);

    const res2 = await client.post('/api/orders', payload, { headers });
    expect(res2.status).toBe(200);
    expect(res2.data.id).toBe(res1.data.id);
    expect(res2.data.isDuplicate).toBe(true);
  });

  // 🟠 2. Security: Resource Isolation
  it('should forbid accessing another users order', async () => {
    const orderId = await createOrder();

    // Create a hacker user
    const hackerClient = createClient(userServiceUrl);
    const hackerEmail = `hacker-${uuidv4()}@example.com`;
    await hackerClient.post('/api/users', { email: hackerEmail, password: 'pw', firstName: 'H', lastName: 'K' });
    const hackerLogin = await hackerClient.post('/api/login', { email: hackerEmail, password: 'pw' });
    const hackerToken = hackerLogin.data.token;

    // Attempt access
    const res = await client.get(`/api/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${hackerToken}` },
      validateStatus: () => true // Prevent axios from throwing on 403
    });

    expect(res.status).toBe(403);
  });

  // 🔴 3. Saga: Cancellation -> Refund Flow
  it('should execute full Refund Saga for PAID orders', async () => {
    const orderId = await createOrder();
    
    // Move to PAID first
    await kafkaClient.produce('payment.completed', orderId, { orderId, status: 'SUCCESS' });
    await waitFor(async () => {
      const res = await client.get(`/api/orders/${orderId}`, { headers: { Authorization: `Bearer ${authToken}` } });
      return res.data.status === 'PAID';
    }, 10000);

    // Request Cancellation
    const cancelRes = await client.post(`/api/orders/cancel/${orderId}`, {}, {
      headers: { 'Authorization': `Bearer ${authToken}`, 'Idempotency-Key': uuidv4() }
    });
    expect(cancelRes.status).toBe(202);

    // Verify 'order.cancel.requested' emitted
    await waitFor(async () => {
      return !!kafkaClient.findMessage('order.events', m => 
        m.orderId === orderId && m.event_type === 'order.cancel.requested'
      );
    }, 10000, 'Cancel Requested event missing');

    // Simulate Refund Completion
    await kafkaClient.produce('payment.refunded', orderId, { orderId, status: 'REFUNDED' });

    // Verify Final Status
    await waitFor(async () => {
      const res = await client.get(`/api/orders/${orderId}`, { headers: { Authorization: `Bearer ${authToken}` } });
      return res.data.status === 'CANCELLED';
    }, 10000, 'Final CANCELLED status missing');
  });

  // 🔴 4. Edge Case: Payment Failure
  it('should transition to PAYMENT_FAILED on failure event', async () => {
    const orderId = await createOrder(999);
    
    await kafkaClient.produce('payment.failed', orderId, {
      orderId, paymentId: 'pay_fail', reason: 'NO_FUNDS'
    });

    await waitFor(async () => {
      const res = await client.get(`/api/orders/${orderId}`, { headers: { Authorization: `Bearer ${authToken}` } });
      return res.data.status === 'PAYMENT_FAILED';
    }, 10000);
  });

  // 🔴 5. Edge Case: Duplicate Consumer Events
  it('should remain stable receiving duplicate payment.completed events', async () => {
    const orderId = await createOrder();
    const event = { orderId, paymentId: 'pay_dup', status: 'SUCCESS' };

    // Send twice
    await kafkaClient.produce('payment.completed', orderId, event);
    await kafkaClient.produce('payment.completed', orderId, event);

    await waitFor(async () => {
      const res = await client.get(`/api/orders/${orderId}`, { headers: { Authorization: `Bearer ${authToken}` } });
      return res.data.status === 'PAID';
    }, 10000);
    // Implicit pass if service didn't crash and status is correct
  });

  // ☠️ 6. DLQ Validation
  it('should send malformed payment events to DLQ', async () => {
    const badOrderId = 'invalid-uuid-format';
    const badEvent = { orderId: badOrderId, paymentId: uuidv4() };

    // Send message that should crash the consumer logic (or fail validation)
    await kafkaClient.produce('payment.completed', badOrderId, badEvent);

    await waitFor(async () => {
      // Look in the DLQ topic
      return !!kafkaClient.findMessage('order.dlq', msg => msg.orderId === badOrderId);
    }, 10000, 'Message not found in DLQ');
  });
});