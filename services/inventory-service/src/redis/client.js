//src/redis/client.js
const Redis = require("ioredis");

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  
  port: Number(process.env.REDIS_PORT || 6379),

  // ✅ for prod (ElastiCache usually has auth + TLS)
  password: process.env.REDIS_PASSWORD || undefined,

  // ✅ TLS only when enabled (ElastiCache uses TLS)
  tls: process.env.REDIS_TLS === "true" ? {} : undefined,

  // ✅ resilience
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false,
  connectTimeout: 10000,
  retryStrategy(times) {
    return Math.min(times * 100, 2000); // backoff
  }
});

redis.on("connect", () => {
  console.log("✅ Redis connected");
});

redis.on("error", (err) => {
  console.error("❌ Redis error", err.message);
});

module.exports = redis;
