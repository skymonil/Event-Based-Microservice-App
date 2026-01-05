const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const requestIdMiddleware = require("./middleware/request-id.middleware");
const orderRoutes = require("./routes/order.routes");
const errorHandler = require("./middleware/error.middleware");
const { httpRequestDuration } = require("./metrics");
const app = express();
const { register } = require("./metrics");

// Security headers
app.use(helmet());

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());


app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer({
    method: req.method,
    route: req.route?.path || req.path
  });

  res.on("finish", () => {
    end({ status: res.statusCode });
  });

  next();
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});
// 🔹 Request ID middleware (FIRST)
app.use(requestIdMiddleware);

// Health check (important for Kubernetes)
app.get("/health", (req, res) => {
  res.status(200).json({ status: "UP" });
});

// Routes
app.use("/api", orderRoutes);

// Central error handler (must be last)
app.use(errorHandler);

module.exports = app;
