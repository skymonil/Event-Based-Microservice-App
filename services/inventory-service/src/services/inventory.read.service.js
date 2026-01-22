//src/services/inventory-service/src/services/inventory.read.service.js
const redis = require("../redis/client");

const getProductAvailability = async (productId) => {
  const key = `stock:product:${productId}`;
  const data = await redis.hgetall(key);

  if (!data || !data.available) {
    return {
      productId,
      available: 0,
      source: "redis-miss"
    };
  }

  return {
    productId,
    total: Number(data.total),
    available: Number(data.available),
    source: "redis"
  };
};

module.exports = { getProductAvailability };
