const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const requestIdMiddleware = require("./middleware/request-id.middleware");
const inventoryRoutes = require("./routes/inventory.routes");
const errorHandler = require("./middleware/error.middleware");

const metricsMiddleware = require("./middleware/prometheus.middleware");
const { register } = require("./metrics");

const app = express();

// Security headers
app.use(helmet());

// Enable CORS
app.use(cors());

// Prometheus metrics middleware
app.use(metricsMiddleware);

// Parse JSON bodies
app.use(express.json());

// 🔹 Request ID middleware (FIRST)
app.use(requestIdMiddleware);

// Health check (important for Kubernetes)
app.get("/health", (_req, res) => {
	app.get("/health", async (_req, res) => {
		try {
			await db.query("SELECT 1");

			await redis.ping();

			res.status(200).json({
				status: "UP",
			});
		} catch (err) {
			res.status(503).json({
				status: "DOWN",

				error: err.message,
			});
		}
	});
});

app.get("/ready", (_req, res) => {
	res.status(200).send("READY");
});

// Routes
app.use("/api", inventoryRoutes);

app.get("/metrics", async (_req, res) => {
	res.set("Content-Type", register.contentType);
	res.end(await register.metrics());
});

// Central error handler (must be last)
app.use(errorHandler);

module.exports = app;
