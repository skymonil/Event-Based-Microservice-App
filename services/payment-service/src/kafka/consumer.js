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

const { context, propagation, trace } = require("@opentelemetry/api");
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
        topic: "order.created",
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

      const extractedContext = propagation.extract(
        context.active(),
        message.headers || {}
      );

      await context.with(extractedContext, async () => {
        const event = JSON.parse(message.value.toString());

        let attempt = 0;

        while (attempt <= MAX_RETRIES) {
          try {
            await tracer.startActiveSpan(
              "process order.created",
              {
                attributes: {
                  "messaging.topic": topic,
                  "order.id": event.orderId
                }
              },
              async (span) => {
                await paymentService.processPayment({
                  orderId: event.orderId,
                  userId: event.userId,
                  amount: event.totalAmount,
                  idempotencyKey: event.idempotencyKey
                });
                span.end();
              }
            );

            // ✅ Success → exit retry loop
            return;
          } catch (err) {
            attempt++;
            kafkaRetries.inc({ topic, service: SERVICE_NAME });

            // 🛑 Infrastructure failure → pause consumer
            if (err.isSystemic) {
              logger.error("Systemic failure detected. Pausing consumer.");

              consumerPaused.set({ topic, service: SERVICE_NAME }, 1);
              consumer.pause([{ topic, partition }]);

              setTimeout(() => {
                consumer.resume([{ topic, partition }]);
                consumerPaused.set({ topic, service: SERVICE_NAME }, 0);
                logger.info("Consumer resumed after infra pause");
              }, 30000);

              return;
            }

            // 🔁 Retry with backoff
            if (attempt <= MAX_RETRIES) {
              await exponentialBackoff(attempt);
              continue;
            }

            // ☠️ Terminal failure → DLQ
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
