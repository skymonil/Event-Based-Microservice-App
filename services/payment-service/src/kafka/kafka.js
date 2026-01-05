const { Kafka, Partitioners } = require('kafkajs');
const config = require('../config/config')

const kafka = new Kafka({
    clientId: "payment-service",
    brokers: config.kafka.brokers
})

module.exports = kafka;