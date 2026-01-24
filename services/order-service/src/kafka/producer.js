const kafka = require('./kafka')
const {logger} = require('../utils/logger')
const {trace, context, propagation } = require("@opentelemetry/api");

const prepareOrderCreatedEvent = (event) => {
  const headers = {};
  propagation.inject(context.active(), headers || {});

  logger.info(`Preparing outbox event for Order: ${event.orderId}`);

  return {
    aggregate_type: 'ORDER',
    aggregate_id: event.orderId,
    event_type: 'order.created', // This maps to the Kafka Topic Name via Debezium SMT
      traceparent: headers.traceparent,
      tracestate: headers.tracestate,
    payload: {
      orderId: event.orderId,
      userId: event.userId,
      totalAmount: event.totalAmount,
      items: event.items,
      createdAt: event.createdAt
    },
    
    metadata: {
      traceparent: headers.traceparent,
    tracestate: headers.tracestate,
      'x-request-id': event.requestId,
      'idempotency-key': event.idempotencyKey,
    }
  };
};

// These become "No-Ops" or simple loggers since Debezium handles the connection
const connectProducer = async () => {
  logger.info("CDC Outbox mode active: Manual Kafka Producer connection skipped.");
};

const disconnectProducer = async () => {
  logger.info("CDC Outbox mode active: Manual Kafka Producer disconnect skipped.");
};

module.exports = {
  connectProducer,
  disconnectProducer,
  prepareOrderCreatedEvent
};