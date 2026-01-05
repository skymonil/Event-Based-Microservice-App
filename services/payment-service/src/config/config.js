require("dotenv").config();

const config = {
  env: process.env.NODE_ENV || "development",

  port: Number(process.env.PORT) || 3002,

  database: {
    url: process.env.DB_URL
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET
  },

  kafka: {
    brokers: process.env.KAFKA_BROKERS
      ? process.env.KAFKA_BROKERS.split(",")
      : []
  },

  logLevel: process.env.LOG_LEVEL || "info"
};

// Fail fast (important)
if (!config.database.url) {
  throw new Error("DB_URL is not defined");
}

if (!config.auth.jwtSecret) {
  throw new Error("JWT_SECRET is not defined");
}

if (!config.kafka.brokers.length) {
  throw new Error("KAFKA_BROKERS is not defined");
}

module.exports = config;
