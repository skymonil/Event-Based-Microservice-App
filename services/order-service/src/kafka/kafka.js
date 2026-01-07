const {Kafka} = require('kafkajs')
const config = require('../config/config')

const kafka = new Kafka({
    clientId: "order-service",
     brokers: [process.env.KAFKA_BROKERS],
     retry: {
    initialRetryTime: 1000,
    retries: 10 // Stack Overflow suggests at least 10 for startup stability
  }
})

module.exports = kafka;