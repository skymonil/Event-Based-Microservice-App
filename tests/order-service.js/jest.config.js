const baseConfig = require('../jest.config.js') || {};

module.exports = {
  ...baseConfig,
  displayName: 'order-service',
  testEnvironment: 'node',
  verbose: true,
  testMatch: ['**/*.e2e.test.js'],
  testTimeout: 60000 // Extended timeout for Async Kafka flows
};