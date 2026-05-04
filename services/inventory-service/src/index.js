const {initTelemetry} = require("@my-app/common");
initTelemetry("inventory-service");
const http = require("http");
const app = require("./app");
const config = require("./config/config");
const { logger } = require("@my-app/common");
// ✅ Import disconnectConsumer so shutdown doesn't crash
const { startConsumer, disconnectConsumer } = require("./kafka/consumer");
const { startRedisProjection } = require("./redis/stock-projection.consumer");
const gracefulShutdown = require("http-graceful-shutdown");
const db = require("./db");

const server = http.createServer(app);

// 🚀 THE FIX: Async Bootstrap Function
const startServer = async () => {
	try {
		logger.info("⏳ Connecting to Kafka...");
		// We AWAIT this. If Kafka is down, we don't start the web server.
		await startConsumer();
		logger.info("✅ Inventory Kafka Consumer Connected & Ready");

		logger.info("⏳ Connecting to Redis for Stock Projections...");
		await startRedisProjection();
		logger.info("✅ Redis Stock Projection Consumer Connected & Ready");

		server.listen(config.port, () => {
			logger.info(`🚀 Inventory Service 5.86 running on port ${config.port}`);
		});
	} catch (err) {
		logger.error(err, "❌ Failed to start Inventory Service");
		process.exit(1);
	}
};

startServer();

gracefulShutdown(server, {
	signals: "SIGINT SIGTERM",
	timeout: 30000,
	onShutdown: async () => {
		logger.info("Shutting down Inventory Service gracefully...");

		try {
			if (disconnectConsumer) {
				await disconnectConsumer();
				logger.info("Kafka Consumer disconnected.");
			}
		} catch (err) {
			logger.error("Error disconnecting Kafka Consumer:", err);
		}

		try {
			await db.close(); // Ensure this matches your db module (close vs end)
			logger.info("Database connection closed.");
		} catch (err) {
			logger.error("Error closing database:", err);
		}
	},
	finally: () => {
		logger.info("Inventory Service shutdown complete.");
	},
});
