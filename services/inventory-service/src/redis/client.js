//src/redis/client.js
const Redis = require("ioredis");

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: 6379,
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false // 🚨 prevents memory explosion
});

redis.on("connect", () => {
  console.log("✅ Redis connected");
});

redis.on("error", (err) => {
  console.error("❌ Redis error", err.message);
});

module.exports = redis;
