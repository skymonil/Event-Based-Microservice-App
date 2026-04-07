const { initTelemetry } = require("@my-app/common");

initTelemetry("user-service");
const http = require("node:http");
const app = require("./app");
const config = require("./config/config");
const { logger } = require("@my-app/common"); // This extracts just the logger
const gracefulShutdown = require("http-graceful-shutdown");
const server = http.createServer(app);

server.listen(config.port, () => {
	logger.info(`User ServiceV5.79  running on port ${config.port}`);
});

gracefulShutdown(server, {
	signals: "SIGINT SIGTERM",
	timeout: 30000,
	onShutdown: async () => {
		logger.info("Shutting down User Service gracefully...");
	},
});
