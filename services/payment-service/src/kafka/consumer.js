const {
  kafkaMessagesConsumed,
  kafkaRetries,
  kafkaDLQ,
  consumerPaused
} = require("../metrics");
const kafka = require('./kafka');
const paymentService = require('../services/payments.service');
const { logger } = require('../utils/logger');
const producer = kafka.producer(); 
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
  let success = false;

  // 🔄 RETRY LOOP: Keep trying to connect until Kafka is ready
  while (!success) {
    try {
      logger.info("Attempting to connect to Kafka...");
      
      await consumer.connect();
      await producer.connect(); // Ensure producer is also ready for retries

      // Subscribe to all required topics
      // Note: order.created is your main input topic
      await consumer.subscribe({ topic: "order.created", fromBeginning: true });
      
      // Subscribing to your status topics
      

      logger.info("Successfully connected to Kafka and subscribed to topics");
      success = true;
    } catch (err) {
      logger.error(`Kafka not ready or topic missing: ${err.message}. Retrying in 5s...`);
      // Wait 5 seconds before next attempt
      await new Promise(res => setTimeout(res, 5000));
    }
  }

  // Once connected, start the message processing loop
  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      // ... rest of your logic remains the same ...
      kafkaMessagesConsumed.inc({ topic, service: SERVICE_NAME });

      const sanitizedHeaders = {};
      if (message.headers) {
        Object.keys(message.headers).forEach(key => {
          if (message.headers[key] !== null && message.headers[key] !== undefined) {
            sanitizedHeaders[key] = message.headers[key];
          }
        });
      }

      const extractedContext = propagation.extract(context.active(), message.headers);

      await context.with(extractedContext, async () => {
        const event = JSON.parse(message.value.toString());
        const retryCount = message.headers?.["x-retry-count"] 
          ? parseInt(message.headers["x-retry-count"].toString(), 10) 
          : 0;

        try {
          await tracer.startActiveSpan(
            "process order event",
            { attributes: { topic, "order.id": event.orderId } },
            async (span) => {
              await paymentService.processPayment({
                orderId: event.orderId,
                userId: event.userId,
                amount: event.totalAmount,
                idempotencyKey: event.idempotencyKey,
                traceHeaders: message.headers 
              });
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
            
            const sanitizedHeadersForRetry = {};
            if (message.headers) {
              for (const [key, value] of Object.entries(message.headers)) {
                if (value !== null && value !== undefined) {
                  sanitizedHeadersForRetry[key] = Buffer.isBuffer(value) ? value : String(value);
                }
              }
            }
            
            try {
              await producer.send({
                topic,
                messages: [{
                  key: message.key,
                  value: message.value,
                  headers: {
                    ...sanitizedHeadersForRetry,
                    "x-retry-count": Buffer.from(String(retryCount + 1))
                  }
                }]
              });
            } catch (produceError) {
              logger.error({ produceError }, "Failed to send retry message");
              await sendToDLQ({ topic, message, error: produceError });
            }
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