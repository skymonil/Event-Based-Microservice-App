//src/redis/stock-projection.consumer.js
const kafka = require("../kafka");
const redis = require("./client");
const { logger } = require("../utils/logger");

const consumer = kafka.consumer({
  groupId: "inventory-stock-projection"
});
const { context, propagation, trace } = require("@opentelemetry/api");
const tracer = trace.getTracer("inventory-redis-projection");


const startRedisProjection = async () => {
  await consumer.connect();
  await consumer.subscribe({
    topics: [
      "product.created",
      "inventory.reserved",
      "inventory.released",
      "inventory.expired",
      "stock.adjusted"
    ],
    fromBeginning: true // 🔥 allows rebuild
  });

 await consumer.run({
  eachMessage: async ({ topic, message }) => {
    // 1. Parse payload
    const payload = JSON.parse(message.value.toString());
      let contextData = {};

      // 1. Try to find Tracing Data in the Headers (Where Debezium put it)
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

    // 2. Extract Distributed Tracing Context
    const extractedContext = propagation.extract(
      context.active(),
      contextData || {}
    );

    const eventType = payload.event_type;
    const { items, orderId } = payload;

    logger.info({ eventType, payload }, "📥 Redis Consumer received event");

    // 3. Wrap in Context and Span
    await context.with(extractedContext, async () => {
      await tracer.startActiveSpan(`process ${eventType}`, async (span) => {
        span.setAttribute("event.type", eventType);
        span.setAttribute("order.id", orderId || "N/A");

        try {
          switch (eventType) {
            case "product.created":
              await createProductInRedis(payload);
              break;

            case "inventory.reserved":
              await decrementStock(items);
              break;

            case "inventory.released":
            case "inventory.expired":
              await incrementStock(items);
              break;

            case "stock.adjusted":
              await resetStock(payload);
              break;

            default:
              logger.debug({ eventType }, "Skipping unknown event type");
          }
        } catch (err) {
          span.recordException(err);
          span.setStatus({ code: 2, message: err.message }); // 2 = Error status
          logger.error({ err, eventType }, "Redis projection failed");
          throw err; // Re-throw to trigger KafkaJS retry logic
        } finally {
          span.end();
        }
      });
    });
  }
});
}
      

const decrementStock = async (items) => {
  for (const item of items) {
    const key = `stock:product:${item.productId}`;

    await redis.multi()
      .hincrby(key, "available", -item.quantity)
      .exec();
  }
};

const incrementStock = async (items) => {
  for (const item of items) {
    const key = `stock:product:${item.productId}`;

    await redis.multi()
      .hincrby(key, "available", item.quantity)
      .exec();
  }
};

const resetStock = async ({ productId, total, available }) => {
  const key = `stock:product:${productId}`;

  await redis.hmset(key, {
    total,
    available
  });
};

// Add this helper to store static data
const createProductInRedis = async ({ id, name, sku, stock }) => {
    const key = `stock:product:${id}`;
    await redis.hmset(key, {
        id,
        name, 
        sku,
        total: stock.total,
        available: stock.available
    });
};
module.exports = { startRedisProjection }
