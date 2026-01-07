require("./telemetry");
const http = require("http");
const gracefulShutdown = require("http-graceful-shutdown");

const app = require("./app");
const config = require("./config/config");
const { logger } = require("./utils/logger");
const db = require("./db");
const {
  connectProducer,
  disconnectProducer
} = require("./kafka/producer");
const {
  startConsumer,
  disconnectConsumer
} = require("./kafka/consumer");

const server = http.createServer(app);

(async () => {
  await connectProducer();
  await startConsumer();
  server.listen(config.port, () => {
    logger.info(`Order Service running on port ${config.port}`);
  });
})();


// Graceful shutdown (VERY IMPORTANT for K8s)
gracefulShutdown(server, {
  signals: "SIGINT SIGTERM",
  timeout: 30000,
  onShutdown: async () => {
    logger.info("Shutting down Order Service gracefully...");

    // 1. Disconnect Consumer first: Stop receiving new messages
    try {
      logger.info("Disconnecting Kafka Consumer...");
       await disconnectConsumer(); 
        logger.info("Kafka Consumer disconnected.");
    } catch (err) {
      logger.error("Error disconnecting Kafka Consumer:", err)
    }

    try {
      logger.info("Closing database connection...");
      await db.close();
      logger.info("Database connection closed.");
    } catch (err) {
      logger.error("Error closing database:", err);
    }
  },
  finally: () => {
    logger.info("Order Service shutdown complete.");
  }
});
