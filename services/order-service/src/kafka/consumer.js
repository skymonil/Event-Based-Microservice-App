const {
  kafkaMessagesConsumed,
  kafkaDLQ,
  consumerPaused
} = require("../metrics");

const kafka = require("./kafka");
const orderService = require("../services/order.service");
const { sendToDLQ } = require("./dlq.producer");
const { context, propagation, trace } = require("@opentelemetry/api");

const tracer = trace.getTracer("order-service");
const SERVICE_NAME = "order-service";

const consumer = kafka.consumer({
  groupId: SERVICE_NAME,
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  rebalanceTimeout: 60000
});

const isInfraError = (err) =>
  err.code === "ECONNREFUSED" ||
  err.code === "ETIMEDOUT" ||
  err.message?.includes("database");

const startConsumer = async () => {
  let connected = false;

  // 🛡️ Fix for UNKNOWN_TOPIC_OR_PARTITION
  while (!connected) {
    try {
      await consumer.connect();
      await consumer.subscribe({ topic: "payment.completed", fromBeginning: false });
      await consumer.subscribe({ topic: "payment.failed", fromBeginning: false });
      connected = true;
      console.log("✅ Order-Service Consumer Subscribed");
    } catch (err) {
      console.error("❌ Kafka Topics not ready, retrying in 5s...", err.message);
      await new Promise(res => setTimeout(res, 5000));
    }
  }

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      kafkaMessagesConsumed.inc({ topic, service: SERVICE_NAME });

      const extractedContext = propagation.extract(context.active(), message.headers);

      await context.with(extractedContext, async () => {
        const event = JSON.parse(message.value.toString());

        try {
          await tracer.startActiveSpan(`process ${topic}`, async (span) => {
            if (topic === "payment.completed") {
              await orderService.handlePaymentCompleted(event.orderId, event.paymentId);
            } else if (topic === "payment.failed") {
              await orderService.handlePaymentFailed(event.orderId, event.paymentId, event.reason);
            }
            span.end();
          });
        } catch (err) {
          if (isInfraError(err)) {
            console.error("🚨 Infrastructure error. Pausing consumer for 10s.");
            consumerPaused.set({ topic, service: SERVICE_NAME }, 1);
            consumer.pause([{ topic }]);

            // 🔄 Simple Resume Logic
            setTimeout(() => {
              console.log("🔄 Attempting to resume consumer...");
              consumer.resume([{ topic }]);
              consumerPaused.set({ topic, service: SERVICE_NAME }, 0);
            }, 10000); 
            
            throw err; // Re-throw to let KafkaJS handle the retry/offset
          }

          // Business error: Send to DLQ
          kafkaDLQ.inc({ topic, service: SERVICE_NAME });
          await sendToDLQ({ topic, message, error: err });
        }
      });
    }
  });
};

module.exports = { startConsumer };