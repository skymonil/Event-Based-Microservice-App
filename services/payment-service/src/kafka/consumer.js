// services/payment-service/src/kafka/consumer.js
const {
  kafkaMessagesConsumed,
  kafkaRetries,
  kafkaDLQ,
  consumerPaused
} = require("../metrics");

const kafka = require("./kafka");
const paymentService = require("../services/payments.service");
const { logger } = require("../utils/logger");
const { sendToDLQ } = require("./dlq.producer");
const { exponentialBackoff } = require("../utils/backoff");

const { context, propagation, trace, SpanStatusCode } = require("@opentelemetry/api");
const tracer = trace.getTracer("payment-service");

const SERVICE_NAME = "payment-service";
const MAX_RETRIES = 3;

const consumer = kafka.consumer({
  groupId: SERVICE_NAME
});

const startConsumer = async () => {
  let connected = false;

  while (!connected) {
    try {
      logger.info("Attempting to connect to Kafka...");
      await consumer.connect();

      await consumer.subscribe({
        topics: [ "inventory.reserved", "order.cancel.requested"], 
        fromBeginning: false
      });

      logger.info("Kafka consumer connected and subscribed");
      connected = true;
    } catch (err) {
      logger.error(`Kafka not ready: ${err.message}. Retrying in 5s...`);
      await new Promise(res => setTimeout(res, 5000));
    }
  }

 await consumer.run({
    autoCommit: true,
    eachMessage: async ({ topic, message, partition }) => {
      kafkaMessagesConsumed.inc({ topic, service: SERVICE_NAME });

      const payload = JSON.parse(message.value.toString());
      let contextData = {};

      // 1. Unpack Metadata
      if (message.headers && message.headers.event_metadata) {
        try {
          contextData = JSON.parse(message.headers.event_metadata.toString());
        } catch (e) {
          logger.warn("Failed to parse Debezium metadata header", e);
        }
      } else if (payload.metadata) {
        contextData = payload.metadata;
      }

      const extractedContext = propagation.extract(context.active(), contextData || {});

      await context.with(extractedContext, async () => {
        let attempt = 0;

        while (attempt <= MAX_RETRIES) {
          try {
            const spanName = `process ${topic}`;

            // 2. Start Span
            await tracer.startActiveSpan(spanName, {
              attributes: {
                "messaging.topic": topic,
                "order.id": payload.orderId,
                "retry.attempt": attempt
              }
            }, async (span) => {
              // 🟢 START INTERNAL TRY/CATCH (Scope: Span is available here)
              try {
                // 3. Routing Logic
                if (topic === "inventory.reserved") {
                  await paymentService.processPayment({
                    orderId: payload.orderId,
                    userId: payload.userId,
                    totalAmount: payload.totalAmount,
                    idempotencyKey: payload.idempotencyKey,
                    currency: payload.currency || "INR",
                    traceHeaders: payload.metadata
                  });
                } else if (topic === "order.cancel.requested") {
                  await paymentService.processRefund({
                    orderId: payload.orderId,
                    userId: payload.userId,
                    idempotencyKey: payload.idempotencyKey,
                    traceHeaders: payload.metadata
                  });
                }

                // Success!
                span.setStatus({ code: SpanStatusCode.OK });

              } catch (innerErr) {
                // 🔴 Record Error on Span (Span is accessible!)
                span.recordException(innerErr);
                span.setStatus({ code: SpanStatusCode.ERROR, message: innerErr.message });
                throw innerErr; // Re-throw to trigger the outer retry loop

              } finally {
                // 🏁 End Span (Span is accessible!)
                span.end();
              }
            });

            return; // Success! Exit the while loop

          } catch (err) {
            // 🟡 OUTER CATCH: Handle Retry Flow (Span is NOT accessible here)
            attempt++;
            kafkaRetries.inc({ topic, service: SERVICE_NAME });

            // 🛑 Infrastructure failure -> pause consumer
            if (err.isSystemic) {
              logger.error("Systemic failure detected. Pausing consumer.");
              consumerPaused.set({ topic, service: SERVICE_NAME }, 1);
              consumer.pause([{ topic, partition }]);
              setTimeout(() => {
                consumer.resume([{ topic, partition }]);
                consumerPaused.set({ topic, service: SERVICE_NAME }, 0);
              }, 30000);
              return;
            }

            if (attempt <= MAX_RETRIES) {
              await exponentialBackoff(attempt);
              continue; // Retry loop
            }

            // ☠️ Terminal failure -> DLQ
            kafkaDLQ.inc({ topic, service: SERVICE_NAME });
            await sendToDLQ({ topic, message, error: err });
            return;
          }
        }
      });
    }
  });
};


module.exports = { startConsumer };
