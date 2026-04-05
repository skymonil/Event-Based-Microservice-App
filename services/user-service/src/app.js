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

app.use(prometheusMiddleware(metrics));

//Prometheus Scrape Endpoint
app.get("/metrics", async (_req, res) => {
	res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
});

// Security headers
app.use(helmet());

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());



// Health check (important for Kubernetes)
app.get("/health", (_req, res) => {
	res.status(200).json({ status: "UP Version 5.53" });
});

// Routes
app.use("/api", userRoutes);

// Central error handler (must be last)
app.use(errorMiddleware);

module.exports = app;
