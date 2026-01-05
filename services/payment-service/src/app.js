const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { register } = require("./metrics");
const paymentsRoutes = require("./routes/payments.routes");
const errorHandler = require("./middleware/error.middleware");
const requestIdMiddleware = require("./middleware/request-id.middleware");

const app = express();

// Security & basics
app.use(helmet());
app.use(cors());
app.use(express.json());

// Request tracing
app.use(requestIdMiddleware);

// Routes
app.use("/api", paymentsRoutes);

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// Health check (important for k8s later)
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Error handler (RFC 7807)
app.use(errorHandler);

module.exports = app;