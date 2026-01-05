const {Kafka} = require('kafkajs')
const config = require('../config/config')

const kafka = new Kafka({
    clientId: "order-service",
    brokers: config.kafka.brokers
})

module.exports = kafka;