const express = require("express");
const helmet = require("helmet");
const cors = require("cors");

const { 
    prometheusMiddleware, 
    errorMiddleware, // Use the shared one!
	AppError
} = require("@my-app/common");
const metrics = require("./metrics");
const userRoutes = require("./routes/user.routes");

const { register } = require("./metrics");

const app = express();

/* app.use(prometheusMiddleware(metrics)); */

//Prometheus Scrape Endpoint
/* app.get("/metrics", async (_req, res) => {
	res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
}); */

// Security headers
app.use(helmet());

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());



app.get("/healthz", (_req, res) => {
    res.status(200).send("OK");
});

// Readiness: Checks if dependencies (DB, Kafka, etc.) are reachable.
app.get("/readyz", async (_req, res) => {
    try {
        // Example: Check if your Database is connected
        // await db.raw('SELECT 1'); 
        
        res.status(200).json({ 
            status: "READY",
            version: "5.53",
            uptime: process.uptime()
        });
    } catch (err) {
        // If DB is down, return 503 so K8s removes this pod from the LoadBalancer
        res.status(503).json({ status: "NOT_READY", reason: err.message });
    }
});

// Routes
app.use("/api/users", userRoutes);

// Central error handler (must be last)
app.use(errorMiddleware);

module.exports = app;
