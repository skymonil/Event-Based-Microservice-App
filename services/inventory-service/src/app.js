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

app.get("/health/live", (_req, res) => {
	res.status(200).send("OK");
});

app.get("/health/ready", async (_req, res) => {
    const checks = {
        database: false,
        outboxSystem: "CDC (Debezium)", // Metadata for observability
    };

    try {
        // 1. Check Database connection
        // We use a query that ensures the connection pool is healthy
        await db.query("SELECT 1");
        checks.database = true;

        // In CDC mode, if DB is up, we are ready to take orders.
        return res.status(200).json({ 
            status: "Ready", 
            version: "5.53",
            checks 
        });
        
    } catch (err) {
        logger.error({ err }, "Readiness check failed: Database unreachable");
        res.status(503).json({ 
            status: "Unhealthy", 
            checks, 
            error: "Database connection failed" 
        });
    }
});

// Routes
app.use("/api/inventory", inventoryRoutes);

app.get("/metrics", async (_req, res) => {
	res.set("Content-Type", register.contentType);
	res.end(await register.metrics());
});

// Central error handler (must be last)
app.use(errorMiddleware);

module.exports = app;
