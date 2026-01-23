// services/payment-service/src/kafka/producer.js
const {logger} = require('../utils/logger')
const{ Partitioners }= require('kafkajs')
const kafka = require('./kafka')
const { context, propagation } = require("@opentelemetry/api");

// No-ops to maintain compatibility with your service startup logic
const connectProducer = async () => {
  logger.info("CDC Outbox mode active in Payment Service.");
};




const preparePaymentEvent = (event, eventType) => {
  const traceHeaders = {};
  propagation.inject(context.active(), traceHeaders);

  logger.info(`Preparing ${eventType} outbox event for Order: ${event.orderId}`);

  return {
    aggregate_type: 'PAYMENT',
    aggregate_id: event.orderId, // We use orderId as the key for partition grouping
    event_type: eventType,       // 'payment.completed' or 'payment.failed'
    payload: {
      orderId: event.orderId,
      paymentId: event.paymentId,
      userId: event.userId,
      amount: event.amount,
      status: eventType === 'payment.completed' ? "COMPLETED" : "FAILED",
      provider: "MOCK",
      occurredAt: new Date().toISOString()
    },
    metadata: {
      ...traceHeaders,
      'x-request-id': event.requestId,
      'x-source-service': 'payment-service'
    }
  };
};


module.exports = {
  preparePaymentEvent,
  connectProducer
  
};