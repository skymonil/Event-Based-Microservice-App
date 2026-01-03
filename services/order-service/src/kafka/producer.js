const {Kafka} = require('kafkajs')
const config = require('../config/config')
const {logger} = require('../utils/logger')

const kafka = new Kafka({
    clientId: "order-service",
    brokers: config.kafka.brokers
})

const producer = kafka.producer();

const connectProducer = async() => {
    await producer.connect();
    logger.info("Kafka producer connected")
}

const disconnectProducer = async () => {
  await producer.disconnect();
  logger.info("Kafka producer disconnected");
};


const publishOrderCreated = async (event) => {
  await producer.send({
    topic: "order.created",
    messages: [
      {
        key: event.orderId,
        // HEADERS: For infrastructure (tracing, idempotency, routing)
        headers: {
          'x-request-id': event.requestId,
          'x-idempotency-key': event.idempotencyKey,
          'x-event-type': 'order.created'
        },
        // VALUE: For business data (the actual order details)
        value: JSON.stringify({
          orderId: event.orderId,
          userId: event.userId,
          totalAmount: event.totalAmount,
          items: event.items,
          createdAt: event.createdAt
        })
      }
    ]
  });
};

module.exports = {
  connectProducer,
  disconnectProducer,
  publishOrderCreated
};