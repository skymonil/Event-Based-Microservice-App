const {logger} = require('../utils/logger')
const{ Partitioners }= require('kafkajs')
const kafka = require('./kafka')

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


const publishPaymentCompleted = async (event) => {
  await producer.send({
    topic: "payment.completed",
    messages: [
      {
        key: event.orderId,
        acks : -1,
        // Transport / tracing metadata ONLY
        headers: {
          "x-request-id": event.requestId,
          "x-event-name": "payment.completed",
          "x-event-version": "1",
          "x-source-service": "payment-service"
        },

        // All business data lives here
        value: JSON.stringify({
          orderId: event.orderId,
          paymentId: event.paymentId,
          userId: event.userId,
          amount: event.amount,
          status: "COMPLETED",
          provider: "MOCK",
          occurredAt: new Date().toISOString()
        })
      }
    ]
  });
};;

const publishPaymentFailed = async(event) =>{
  await producer.send({
    topic: "payment.failed",
     messages: [
      {
        key: event.orderId,

        // Transport / tracing metadata ONLY
        headers: {
          "x-request-id": event.requestId,
          "x-event-name": "payment.failed",
          "x-event-version": "1",
          "x-source-service": "payment-service"
        },

        // All business data lives here
        value: JSON.stringify({
          orderId: event.orderId,
          paymentId: event.paymentId,
          userId: event.userId,
          amount: event.amount,
          status: "FAILED",
          provider: "MOCK",
          occurredAt: new Date().toISOString()
        })
      }
    ]
  })
}
module.exports = {
  publishPaymentCompleted,
  publishPaymentFailed,
  connectProducer,
};