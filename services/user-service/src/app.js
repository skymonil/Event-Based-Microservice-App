const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const requestIdMiddleware = require("./middleware/request-id.middleware");
const userRoutes = require("./routes/user.routes");
const errorHandler = require("./middleware/error.middleware");
const prometheusMiddleware = require('./middleware/prometheusMiddleware')
const {client}   = require('./metrics')

const app = express();

app.use(prometheusMiddleware)


//Prometheus Scrape Endpoint
app.get('/metrics', async(req, res) => {
   res.set('Content-Type',
   client.register.contentType
   )

   res.end( await client.register.metrics())
})



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
  res.status(200).json({ status: "UP Version 5.49" });
});

// Routes
app.use("/api", userRoutes);

// Central error handler (must be last)
app.use(errorHandler);

module.exports = app;
