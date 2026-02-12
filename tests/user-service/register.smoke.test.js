const { v4: uuidv4 } = require('uuid');
const { createClient } = require('../common/httpClient');
const { expectHttpError } = require('../common/assertions');

// Initialize client (Base URL comes from ENV)
const client = createClient();

describe('User Service - Registration Smoke Test', () => {
  const uniqueEmail = `smoke-reg-${uuidv4()}@example.com`;
  const password = 'StrongPassword123!';
  const userName = 'Smoke Tester';

  it('should register a new user successfully (201)', async () => {
    const res = await client.post('/api/users', {
      email: uniqueEmail,
      password: password,
      name: userName // 🟢 UPDATED: Controller expects 'name', not firstName/lastName
    });

    expect(res.status).toBe(201);
    
    // 🟢 UPDATED: Controller returns { message, user }
    expect(res.data).toHaveProperty('user');
    expect(res.data.user).toHaveProperty('id');
    expect(res.data.user.email).toBe(uniqueEmail);
    expect(res.data.user.name).toBe(userName);
  });

  it('should fail when registering with an existing email (409)', async () => {
    // Retry same payload
    const req = client.post('/api/users', {
      email: uniqueEmail,
      password: password,
      name: userName
    });

    // 🟢 Note: Ensure your Error Handler middleware maps "User already exists" to 409
    await expectHttpError(req, 409); 
  });

  it('should fail with invalid payload (400)', async () => {
    const req = client.post('/api/users', {
      email: 'bad-email-format',
      name: 'Invalid User' 
      // missing password
    });

    await expectHttpError(req, 400);
  });
});