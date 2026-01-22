//src/redis/stock-projection.consumer.js
const kafka = require("../kafka");
const redis = require("./client");
const { logger } = require("../utils/logger");

const consumer = kafka.consumer({
  groupId: "inventory-stock-projection"
});

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
      const payload = JSON.parse(message.value.toString());
     const eventType = payload.event_type; 
     logger.info({ eventType, payload }, "📥 Redis Consumer received event");

     const { orderId, items } = payload;
    

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
        }
      } catch (err) {
      logger.error({ err, eventType }, "Redis projection failed");
        throw err; // Throwing ensures Kafka retries this message
      }
    }
  });
};

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
module.exports = { startRedisProjection };
