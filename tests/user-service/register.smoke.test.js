const { v4: uuidv4 } = require('uuid');
const { createClient } = require('../common/httpClient');
const { waitFor } = require('../common/waitFor');

const client = createClient();

describe('User Service - Registration Smoke Test', () => {
 const uniqueEmail = `smoke-reg-${Date.now()}-${uuidv4()}@example.com`;
  const password = 'StrongPassword123!';
  const userName = 'Smoke Tester';

  // 🟢 FIX: Added 60000ms timeout to the HOOK itself
  beforeAll(async () => {
    console.log("⏳ Register Test: Waiting for service...");

    await waitFor(async () => {
      try {
        const res = await client.get('/health');
        return res.status === 200;
      } catch (e) {
        // 🟢 Log the error so we know if it's 404 or Connection Refused
        console.log(`[Register] Waiting... Error: ${e.message}`);
        return false;
      }
    }, 60000, 'User service not ready for Register Test'); // 🟢 Wait up to 60s

    console.log("✅ User Service Ready!");
  }, 60000); // 🟢 Jest Hook Timeout set to 60s

  it('should register a new user successfully (201)', async () => {
    const res = await client.post('/api/users', {
      email: uniqueEmail,
      password: password,
      name: userName
    });

    expect(res.status).toBe(201);
    expect(res.data).toHaveProperty('user');
    expect(res.data.user.email).toBe(uniqueEmail);
  });

  it('should fail when registering with an existing email (409)', async () => {
    const req = client.post('/api/users', {
      email: uniqueEmail,
      password: password,
      name: userName
    });
    expect(req.status).toBe(409)
  });

  it('should fail with invalid payload (400)', async () => {
    const res = client.post('/api/users', {
      email: 'bad-email-format',
      name: 'Invalid User'
    });
    expect(res.status).toBe(400);
    
  });
});