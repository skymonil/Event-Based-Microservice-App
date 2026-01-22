const { Kafka, logLevel } = require("kafkajs");
const config = require("../config/config"); // Assuming you have a config loader
const { logger } = require("../utils/logger");

// 1. Initialize the Kafka Client
const kafka = new Kafka({
  clientId: "inventory-service", // Unique name for this service
  brokers: config.kafka.brokers, // e.g., ["kafka:29092"]
  logLevel: logLevel.INFO,
  
  // Custom Logger (Optional: Connects KafkaJS logs to your Pino/Winston logger)
  logCreator: () => {
    return ({ level, log }) => {
      const { message, ...extra } = log;
      switch (level) {
        case logLevel.ERROR:
          logger.error(extra, message);
          break;
        case logLevel.WARN:
          logger.warn(extra, message);
          break;
        case logLevel.INFO:
          logger.info(extra, message);
          break;
        case logLevel.DEBUG:
          logger.debug(extra, message);
          break;
      }
    };
  }
});

module.exports = kafka;