const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const requestIdMiddleware = require("./middleware/request-id.middleware");
const inventoryRoutes = require("./routes/inventory.routes");
const errorHandler = require("./middleware/error.middleware");
const { register } = require("./utils/metrics");

const app = express();

// Security headers
app.use(helmet());

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// 🔹 Request ID middleware (FIRST)
app.use(requestIdMiddleware);

// Health check (important for Kubernetes)
app.get("/health", (req, res) => {
  res.status(200).json({ status: "UP" });
});

// Routes
app.use("/api", inventoryRoutes);

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// Central error handler (must be last)
app.use(errorHandler);

module.exports = app;
