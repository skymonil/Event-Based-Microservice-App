// src/config/config.js
require("dotenv").config();

const config = {
  env: process.env.NODE_ENV || "development",

  port: Number(process.env.PORT) || 3000,

  database: {
    url: process.env.DB_URL
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h"
  },
  kafka: {
    brokers: process.env.KAFKA_BROKERS
      ? process.env.KAFKA_BROKERS.split(",")
      : []
  }
};

// Fail fast if critical config is missing
if (!config.database.url) {
  throw new Error("DB_URL is not defined");
}

if (!config.auth.jwtSecret) {
  throw new Error("JWT_SECRET is not defined");
}

module.exports = config;
