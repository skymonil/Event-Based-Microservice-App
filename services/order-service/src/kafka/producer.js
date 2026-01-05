const kafka = require('./kafka')
const {logger} = require('../utils/logger')
const { context, propagation } = require("@opentelemetry/api");
const producer = kafka.producer({
  allowAutoTopicCreation: false,
  idempotent: true,          // 👈 VERY important
  maxInFlightRequests: 5,
  transactionTimeout: 30000,
createPartitioner: Partitioners.DefaultPartitioner}
);

const connectProducer = async() => {
    await producer.connect();
    logger.info("Kafka producer connected")
}

const disconnectProducer = async () => {
  await producer.disconnect();
  logger.info("Kafka producer disconnected");
};


const publishOrderCreated = async (event) => {

  const traceHeaders = {};
  propagation.inject(context.active(), headers);

  await producer.send({
    topic: "order.created",
    // Ensure all replicas acknowledge receipt to prevent data loss
    acks : -1,
    messages: [
      {
        // Use orderId as key to ensure all events for one order go to the same partiti
        key: event.orderId,
        // HEADERS: For infrastructure (tracing, idempotency, routing)
        headers: {
          ...traceHeaders,
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