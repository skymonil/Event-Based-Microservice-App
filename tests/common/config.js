require('dotenv').config();

module.exports = {
  // Target Service URL (Injected by Argo Analysis args)
  baseUrl: process.env.TARGET_URL || 'http://localhost:3000',
  
  // Kafka Config (For Async Tests)
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'kafka-broker:9092').split(','),
    clientId: 'synthetic-test-runner',
    // Unique Group ID to ensure we don't steal messages from real services
    groupId: 'test-group-' + Math.random().toString(36).substring(7)
  },

  // Test Timeouts
  timeouts: {
    http: 5000,   // 5s for API calls
    async: 15000, // 15s for Kafka propagation
    jest: 30000   // 30s per test case
  },

  // Toggle: Run 'FULL' suite or 'HTTP_ONLY' (Safer for Canary)
  testMode: process.env.TEST_MODE || 'FULL'
};