const express = require("express");
const helmet = require("helmet");
const cors = require("cors");

const { 
    prometheusMiddleware, 
    errorMiddleware, // Use the shared one!
	
} = require("@my-app/common");

const inventoryRoutes = require("./routes/inventory.routes");
const metrics = require("./metrics");
const db = require("./db");


const { register } = require("./metrics");

const app = express();

app.use(prometheusMiddleware(metrics));

// Security headers
app.use(helmet());

// Enable CORS
app.use(cors());



// Parse JSON bodies
app.use(express.json());



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
app.use(errorMiddleware);

module.exports = app;
