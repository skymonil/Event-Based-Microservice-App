const { v4: uuidv4 } = require('uuid');
const { createClient } = require('../common/httpClient');
const { waitFor } = require('../common/waitFor');

const client = createClient();

describe('User Service - Login Smoke Test', () => {
  const email = `smoke-login-${uuidv4()}@example.com`;
  const password = 'LoginPass123!';
  let userId;

  // 🟢 FIX: Added 60000ms timeout to the HOOK itself
  beforeAll(async () => {
    console.log("⏳ Login Test: Waiting for service...");

    // 1. Wait for Service (Up to 60s)
    await waitFor(async () => {
      try {
        const res = await client.get('/health');
        return res.status === 200;
      } catch (e) {
        console.log(`[Login] Waiting... Error: ${e.message}`);
        return false;
      }
    }, 60000, 'Service not ready for Login Test'); // 🟢 Wait up to 60s

    // 2. Create User
    console.log("👤 Creating Login User...");
    const res = await client.post('/api/users', {
      email,
      password,
      name: 'Login User'
    });
    userId = res.data.user.id;
  }, 60000); // 🟢 Jest Hook Timeout set to 60s

  it('should login and return a JWT token', async () => {
    const res = await client.post('/api/login', { email, password });
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('token');
  });

  it('should allow access to protected user profile', async () => {
    const loginRes = await client.post('/api/login', { email, password });
    const token = loginRes.data.token;

    const profileRes = await client.get(`/api/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(profileRes.status).toBe(200);
    expect(profileRes.data.id).toBe(userId);
  });

  it('should reject login with wrong password (401)', async () => {
    const res = await  client.post('/api/login', {
      email,
      password: 'WrongPassword'
    });
  expect(res.status).toBe(401);
  });
});