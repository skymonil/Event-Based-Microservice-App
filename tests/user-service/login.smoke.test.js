const { v4: uuidv4 } = require('uuid');
const { createClient } = require('../common/httpClient');
const { expectHttpError } = require('../common/assertions');

const client = createClient();

describe('User Service - Login Smoke Test', () => {
  const email = `smoke-login-${uuidv4()}@example.com`;
  const password = 'LoginPass123!';
  let userId;

  // 🛠️ Setup: Create a user strictly for this test
  beforeAll(async () => {
    const res = await client.post('/api/users', {
      email,
      password,
      name: 'Login User' // 🟢 UPDATED: Field name fixed
    });
    userId = res.data.user.id; // 🟢 UPDATED: Accessing nested user object
  });

  it('should login and return a JWT token', async () => {
    const res = await client.post('/api/login', {
      email,
      password
    });

    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('token');
    // Verify Token Format (JWT)
    expect(res.data.token).toMatch(/^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/);
  });

  it('should allow access to protected user profile with token', async () => {
    // 1. Login to get token
    const loginRes = await client.post('/api/login', { email, password });
    const token = loginRes.data.token;

    // 2. Use token to fetch profile
    const profileRes = await client.get(`/api/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(profileRes.status).toBe(200);
    expect(profileRes.data.id).toBe(userId);
    expect(profileRes.data.email).toBe(email);
  });

  it('should reject login with wrong password (401)', async () => {
    // 🟢 Note: Ensure your Error Handler middleware maps "Invalid email or password" to 401
    const req = client.post('/api/login', {
      email,
      password: 'WrongPassword'
    });

    await expectHttpError(req, 401);
  });
});