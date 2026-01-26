require("../telemetry");
const http = require("http");
const gracefulShutdown = require("http-graceful-shutdown");

const app = require("./app");
const config = require("./config/config");
const { logger } = require("./utils/logger");
const db = require("./db");
const {
  connectProducer
} = require("./kafka/producer");
const {startConsumer} = require('./kafka/consumer')
const server = http.createServer(app);

(async () => {
  
  await connectProducer();
 await startConsumer();
  server.listen(config.port, () => {
    logger.info(`Payment Service running on port ${config.port}`);
  });
})();


// Graceful shutdown (VERY IMPORTANT for K8s)
gracefulShutdown(server, {
  signals: "SIGINT SIGTERM",
  timeout: 30000,
  onShutdown: async () => {
    logger.info("Shutting down Order Service gracefully...");
    await db.close();
  }
});
