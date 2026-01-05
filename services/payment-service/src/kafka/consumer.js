const {
  kafkaMessagesConsumed,
  kafkaRetries,
  kafkaDLQ,
  consumerPaused
} = require("../metrics");
const kafka = require('./kafka');
const paymentService = require('../services/payments.service');
const { logger } = require('../utils/logger');
const {
  publishPaymentCompleted,
  publishPaymentFailed
} = require('./producer');
const { sendToDLQ } = require('./dlq.producer');
const { exponentialBackoff } = require("../utils/backoff");

// 1️⃣ Import OpenTelemetry API
const { context, propagation, trace } = require("@opentelemetry/api");
const tracer = trace.getTracer("payment-service");

const MAX_RETRIES = 3;
const SERVICE_NAME = "payment-service";

const consumer = kafka.consumer({
  groupId: SERVICE_NAME
});

const startConsumer = async () => {
  await consumer.connect();

  await consumer.subscribe({
    topic: "order.created",
    fromBeginning: false
  });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      // 3.2 Increment “messages consumed”
      kafkaMessagesConsumed.inc({
        topic,
        service: SERVICE_NAME
      });

      // 2️⃣ EXTRACT: Get the trace context from incoming Kafka headers
      const extractedContext = propagation.extract(context.active(), message.headers);

      // 3️⃣ WRAP: Execute logic inside the extracted context
      await context.with(extractedContext, async () => {
        const event = JSON.parse(message.value.toString());
        const retryCount = message.headers?.["x-retry-count"] 
          ? parseInt(message.headers["x-retry-count"].toString(), 10) 
          : 0;

        try {
          // 4️⃣ START SPAN: Record the specific processing action
          await tracer.startActiveSpan(
            "process order event",
            { attributes: { topic, "order.id": event.orderId } },
            async (span) => {
              const result = await paymentService.processPayment({
                orderId: event.orderId,
                userId: event.userId,
                amount: event.totalAmount,
                idempotencyKey: event.idempotencyKey
              });

              if (result.status === "SUCCESS") {
                await publishPaymentCompleted({
                  orderId: event.orderId,
                  paymentId: result.id,
                  amount: event.totalAmount,
                  status: "SUCCESS",
                  createdAt: new Date().toISOString()
                });
              } else {
                await publishPaymentFailed({
                  orderId: event.orderId,
                  paymentId: result.id,
                  status: "FAILED",
                  reason: "Mock payment failure",
                  createdAt: new Date().toISOString()
                });
              }
              span.end();
            }
          );
        } catch (err) {
          // Systemic failure check (Circuit Breaker)
          if (err.isSystemic) {
            consumerPaused.set({ topic, service: SERVICE_NAME }, 1);
            await consumer.pause([{ topic }]);
            logger.error(`Infrastructure failure. Pausing consumer for topic ${topic}`);

            setTimeout(async () => {
              await consumer.resume([{ topic }]);
              consumerPaused.set({ topic, service: SERVICE_NAME }, 0);
              logger.info(`Resuming consumer for topic ${topic}`);
            }, 30000);
          }

          if (retryCount < MAX_RETRIES) {
            kafkaRetries.inc({ topic, service: SERVICE_NAME });
            await exponentialBackoff(retryCount);

            await consumer.producer().send({
              topic,
              messages: [
                {
                  key: message.key,
                  value: message.value,
                  headers: {
                    ...message.headers, // Important: spread headers to keep trace context
                    "x-retry-count": Buffer.from(String(retryCount + 1))
                  }
                }
              ]
            });
          } else {
            kafkaDLQ.inc({ topic, service: SERVICE_NAME });
            await sendToDLQ({ topic, message, error: err });
          }
        }
      });
    }
  });
};

module.exports = { startConsumer };