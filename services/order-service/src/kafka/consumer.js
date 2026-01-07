const {
  kafkaMessagesConsumed,
  kafkaRetries,
  kafkaDLQ,
  consumerPaused
} = require("../metrics");

let isInfraHealthy = true;

const isInfraError = (err) => {
  return (
    err.code === "ECONNREFUSED" ||
    err.code === "ETIMEDOUT" ||
    err.message?.includes("database") ||
    err.message?.includes("connection")
  );
};

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));
const kafka = require("./kafka");
const orderService = require("../services/order.service");
const { sendToDLQ } = require('./dlq.producer')
const { exponentialBackoff } = require("../utils/backoff");
const { context, propagation } = require("@opentelemetry/api");

const { trace } = require("@opentelemetry/api");
const { disconnectProducer } = require("./producer");
const tracer = trace.getTracer("order-service");
const MAX_RETRIES = 3;
const SERVICE_NAME = "order-service";

const consumer = kafka.consumer({
  groupId: SERVICE_NAME,

  

  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  rebalanceTimeout: 60000
});

const waitForInfraRecovery = async (topic) => {
  while (!isInfraHealthy) {
    try {
      await orderService.healthCheck();
      isInfraHealthy = true;
      console.log("Infra recovered. Resuming consumer.");
      
      // 3.5 Consumer pause metric (Reset to 0 on resume)
      consumerPaused.set({ topic, service: SERVICE_NAME }, 0);
      consumer.resume([{ topic }]);
    } catch {
      console.log("Infra still down. Retrying in 5s...");
      await sleep(5000);
    }
  }
};

const startConsumer = async () => {
  await consumer.connect();

  await consumer.subscribe({
    topic: "payment.completed",
    fromBeginning: false
  });

  await consumer.subscribe({
    topic: "payment.failed",
    fromBeginning: false
  });

  await consumer.run({
    eachMessage: async ({ message, topic, partition }) => {
      // 3.2 Increment “messages consumed” (FIRST thing)
      kafkaMessagesConsumed.inc({
        topic,
        service: SERVICE_NAME
      });

      // 1️⃣ EXTRACT: Get the trace context from the incoming Kafka headers
      const extractedContext = propagation.extract(context.active(), message.headers);

      // 2️⃣ WRAP: Execute all logic inside this extracted context
      await context.with(extractedContext, async () => {
        const event = JSON.parse(message.value.toString());

        const retryCount = message.headers?.["x-retry-count"]
          ? parseInt(message.headers["x-retry-count"].toString(), 10)
          : 0;

        try {
        await tracer.startActiveSpan(
  "process payment event",
  { attributes: { topic } },
  async (span) => {
    span.setAttribute("order.id", event.orderId);
    span.setAttribute("payment.id", event.paymentId);
    span.setAttribute("kafka.retry_count", retryCount);

    await orderService.handlePaymentCompleted(event);

    span.end();
  }
);
        } catch (err) {
          // 🛑 ASYNC CIRCUIT BREAKER
          if (isInfraError(err)) {
            console.error("Infra failure detected. Pausing consumer.");
            
            // 3.5 Consumer pause metric (Set to 1 on pause)
            consumerPaused.set({ topic, service: SERVICE_NAME }, 1);
            
            isInfraHealthy = false;
            consumer.pause([{ topic }]);
            waitForInfraRecovery(topic);
            return;
          }

          if (retryCount < MAX_RETRIES) {
            // 3.3 Retry metric (inside retry branch)
            kafkaRetries.inc({
              topic,
              service: SERVICE_NAME
            });

            await exponentialBackoff(retryCount);
            
            // 🔁 Retry
            await consumer.producer().send({
              topic,
              messages: [
                {
                  key: message.key,
                  value: message.value,
                  headers: {
                    ...message.headers,
                    "x-retry-count": Buffer.from(String(retryCount + 1))
                  }
                }
              ]
            });
          } else {
            // 3.4 DLQ metric (inside DLQ branch)
            kafkaDLQ.inc({
              topic,
              service: SERVICE_NAME
            });

            await sendToDLQ({
              topic,
              message,
              error: err
            });
          }
        }
      });
    }
  });
}

const disconnectConsumer = async () => {
  await consumer.disconnect();
}

module.exports = { startConsumer, disconnectConsumer };