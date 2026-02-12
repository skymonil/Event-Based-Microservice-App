const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const requestIdMiddleware = require("./middleware/request-id.middleware");
const orderRoutes = require("./routes/order.routes");
const errorHandler = require("./middleware/error.middleware");
const { prometheusMiddleware } = require('./middleware/prometheusMiddleware')
const app = express();
const { register } = require("./metrics");
const {logger} = require('./utils/logger')


// Security headers
app.use(helmet());

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());

app.use(prometheusMiddleware)
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});
// 🔹 Request ID middleware (FIRST)
app.use(requestIdMiddleware);

/**
 * Liveness Probe: Is the process running?
 * If this returns a non-200, K8s kills the Pod.
 */
app.get('/health/live', (req, res) => {
  res.status(200).send('OK');
});

/**
 * Readiness Probe: Is the DB reachable?
 * If this returns a non-200, K8s stops sending traffic but keeps the Pod alive.
 */
app.get('/health/ready', async (req, res) => {
  try {
    // We use a very lightweight query to check the pulse
    await db.query('SELECT 1');
    res.status(200).send('Ready');
  } catch (err) {
    logger.error({ err }, "Readiness check failed: Database unreachable");
    res.status(503).send('Service Unavailable');
  }
});

// Routes
app.use("/api", orderRoutes);

// Central error handler (must be last)
app.use(errorHandler);

module.exports = app;
