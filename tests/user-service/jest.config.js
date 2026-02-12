module.exports = {
  displayName: 'user-service',
  testEnvironment: 'node',
  verbose: true,
  testMatch: ['**/*.smoke.test.js'], // Look for smoke tests specifically
  setupFilesAfterEnv: [], // Add global teardowns here if needed
  testTimeout: 30000
};