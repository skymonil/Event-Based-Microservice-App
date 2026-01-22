// services/inventory-service/src/kafka/consumer.js
const { Kafka } = require("kafkajs");
const { trace, context, propagation } = require("@opentelemetry/api");
const inventoryService = require("../services/inventory.service");
const { logger } = require("../utils/logger");
const { AppError, BusinessError, InfraError } = require("../utils/app-error")
const kafka = new Kafka({
  clientId: "inventory-service",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});

const consumer = kafka.consumer({ groupId: "inventory-group",
   sessionTimeout: 30000,
  heartbeatInterval: 3000,
  rebalanceTimeout: 60000
 });
const tracer = trace.getTracer("inventory-consumer");

const startConsumer = async () => {
  let connected = false;
  
  // 🛡️ Retry Loop for Infra startup
  while (!connected) {
    try {
      await consumer.connect();
      // Subscribe to relevant topics
      await consumer.subscribe({ 
        topics: ["order.created", "payment.failed", "order.cancelled","payment.refunded"], 
        fromBeginning: false 
      });
      connected = true;
      logger.info("✅ Inventory Consumer connected and subscribed");
    } catch (err) {
      logger.error({ err }, "❌ Failed to connect to Kafka, retrying in 5s...");
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
        let orderId = "unknown";
      // ---------------------------------------------------------
      // 🛠️ FIX: Debezium Header Unpacking
      // Debezium sends metadata as a single JSON string in 'event_metadata'
      // We must unpack 'traceparent' to the root so OpenTelemetry sees it.
      // ---------------------------------------------------------
      const headers = message.headers || {};
      
      if (headers.event_metadata) {
        try {
          // Debezium headers are Buffers, so we toString() first
          const metadataFunc = JSON.parse(headers.event_metadata.toString());
          
          // Hoist the trace headers to the top level
          if (metadataFunc.traceparent) {
            headers.traceparent = metadataFunc.traceparent;
          }
          if (metadataFunc.tracestate) {
            headers.tracestate = metadataFunc.tracestate;
          }
        } catch (parseErr) {
          logger.warn({ err: parseErr.message }, "⚠️ Failed to parse Debezium event_metadata");
        }
      }
      // ---------------------------------------------------------

      // 1. Extract Trace Context (Now it will find 'traceparent' correctly)
      const extractedContext = propagation.extract(
        context.active(),
        headers
      );

      await context.with(extractedContext, async () => {
        await tracer.startActiveSpan(`process ${topic}`, async (span) => {
          try {
            const payload = JSON.parse(message.value.toString());
            const { orderId } = payload;
            
            span.setAttribute("order.id", orderId);
            span.setAttribute("kafka.topic", topic);

            logger.info({ topic, orderId }, "Processing Kafka message");

            switch (topic) {
              case "order.created":
                // 📦 SAGA STEP 1: Try to reserve stock
                await handleOrderCreated(payload);
                break;

              case "payment.failed":
              case "order.cancelled":
              case "payment.refunded":
                // ↩️ SAGA COMPENSATION: Release stock
                await handleReleaseStock(payload);
                break;

              default:
                logger.warn({ topic }, "Received message for unknown topic");
            }

            span.end();
          } catch (err) {
            span.recordException(err);
            span.end();
          // ====================================================
            // 🛡️ ERROR CLASSIFICATION & RETRY STRATEGY
            // ====================================================
            
            const errorDetails = err instanceof AppError ? err.detail : err.message;
            const statusCode = err instanceof AppError ? err.status : 500;

            // 🛑 CASE A: Non-Retryable Error (Business Logic / 4xx)
            // Examples: "Invalid Product ID", "Order already Cancelled", "Validation Error"
            if (
                err instanceof BusinessError || 
                (statusCode >= 400 && statusCode < 500)
            ) {
                logger.warn(
                    { orderId, topic, err: errorDetails }, 
                    "⛔ Non-Retryable Error (Business Logic). Dropping message to avoid Retry Storm."
                );
                
                // TODO: In a real prod env, send to a 'Dead Letter Queue' (DLQ) topic here.
                
                // RETURN means "Success" to Kafka. It commits the offset and moves on.
                return; 
            }

            // 🔄 CASE B: Retryable Error (Infra / 5xx / Unknown)
            // Examples: "DB Timeout", "Network Glitch", "Unhandled Crash"
            logger.error(
                { orderId, topic, err: errorDetails }, 
                "❌ Infrastructure/System Error. Triggering Kafka Retry..."
            );

            // THROWING tells Kafka "I failed".
            // Kafka will pause partition consumption based on your retry policy (backoff).
            throw err;
          }
        });
      });
    },
  });
};

/**
 * Handler for 'order.created'
 */

const handleOrderCreated = async (payload) => {
  const { orderId, items, totalAmount, userId } = payload;

  if (!items || items.length === 0) {
     logger.warn({ orderId }, "⚠️ Order created with no items");
     return;
  }

  // ✅ Pass the WHOLE array now
  const result = await inventoryService.reserveStock({
    orderId,
    items,
    totalAmount,
    userId
  });

  if (!result.success) {
    logger.warn({ orderId, reason: result.reason }, "Reservation failed, triggering compensation");
    
    await inventoryService.handleReservationFailed({
      orderId,
      reason: result.reason
    });
  }
};

/**
 * Handler for cleanup (Payment Failed / User Cancelled)
 */
const handleReleaseStock = async (payload) => {
  const { orderId } = payload;
  await inventoryService.releaseStock(orderId);
};

module.exports = { startConsumer };