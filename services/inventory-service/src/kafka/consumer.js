// services/inventory-service/src/kafka/consumer.js
const { Kafka } = require("kafkajs");
const { trace, context, propagation } = require("@opentelemetry/api");
const inventoryService = require("../services/inventory.service");
const { logger } = require("../utils/logger");
const { AppError, BusinessError, InfraError } = require("../utils/app-error")
const kafka = new Kafka({
  clientId: "inventory-service",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
   retry: {
    initialRetryTime: 300, // Wait 300ms
    retries: 10            // Try 10 times before crashing
  }
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
        fromBeginning: false,
        allowAutoTopicCreation: true
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
      const payload = JSON.parse(message.value.toString());
        let contextData = {};

          if (message.headers && message.headers.event_metadata) {
      try {
        // Headers are Buffers, convert to String -> JSON
        const metadataStr = message.headers.event_metadata.toString();
        contextData = JSON.parse(metadataStr);
      } catch (e) {
        logger.warn("Failed to parse Debezium metadata header", e);
      }
    } 
    // 2. Fallback: Check Payload (In case you used the Producer fix)
    else if (payload.metadata) {
      contextData = payload.metadata;
    }

       const extractedContext = propagation.extract(
      context.active(),
      contextData || {}
    );
        let orderId = "unknown";
      
    

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