const {
  kafkaMessagesConsumed,
  kafkaDLQ,
  consumerPaused
} = require("../metrics");

const kafka = require("./kafka");
const orderService = require("../services/order.service");
const { sendToDLQ } = require("./dlq.producer");
const { logger } = require("../utils/logger");
const { context, propagation, trace, SpanStatusCode } = require("@opentelemetry/api");
const {extractKafkaContext} = require("../tracing/kafka-context");
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
      await consumer.subscribe({
        topics: ["payment.failed", "payment.completed", "payment.refunded"], 
        fromBeginning: false
      });
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

    const event = JSON.parse(message.value.toString());

    // ✅ ALWAYS extract payload this way
    

   
  

    // ✅ Restore trace context
    const extractedContext = extractKafkaContext(message);

    await context.with(extractedContext, async () => {
      try {
        await tracer.startActiveSpan(`process ${topic}`, async (span) => {
          span.setAttribute("order.id", event.orderId);
          span.setAttribute("payment.id", event.paymentId);

          if (topic === "payment.completed") {
            await orderService.handlePaymentCompleted(
              event.orderId,
              event.paymentId
            );
          } 
          else if (topic === "payment.failed") {
            await orderService.handlePaymentFailed(
              event.orderId,
              event.paymentId,
              event.reason
            );
          } 
          else if (topic === "payment.refunded") {
            await orderService.handlePaymentRefunded({
              orderId: event.orderId,
              paymentId: event.paymentId,
              
            });
          }

          span.end();
        });
      } catch (err) {
           span.recordException(err);
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        if (isInfraError(err)) {
          consumerPaused.set({ topic, service: SERVICE_NAME }, 1);
          consumer.pause([{ topic }]);

          setTimeout(() => {
            consumer.resume([{ topic }]);
            consumerPaused.set({ topic, service: SERVICE_NAME }, 0);
          }, 10000);

          throw err;
        }

        kafkaDLQ.inc({ topic, service: SERVICE_NAME });
        await sendToDLQ({ topic, message, error: err });
      }
    });
  }
});
}

module.exports = { startConsumer }