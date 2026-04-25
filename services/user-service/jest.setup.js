// services/user-service/jest.setup.js

// Provide safe, fake environment variables so unit tests don't crash 
// when trying to read config files without a .env present.
process.env.DB_URL = "postgres://fake:fake@localhost:5432/fake_db";
process.env.JWT_SECRET = "fake-secret-for-testing";