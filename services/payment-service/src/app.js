const express = require("express");
const helmet = require("helmet");
const cors = require("cors");

const { errorMiddleware, prometheusMiddleware,  } = require("@my-app/common");

const paymentsRoutes = require("./routes/payments.routes");


const metrics = require("./metrics");

const app = express();

// Security & basics
app.use(helmet());
app.use(cors());

// Prometheus metrics middleware
app.use(prometheusMiddleware(metrics));

app.use(express.json());



// Routes
app.use("/api", paymentsRoutes);

app.get("/metrics", async (_req, res) => {
	res.set("Content-Type", register.contentType);
	res.end(await register.metrics());
});

// Health check (important for k8s later)
app.get("/health", (_req, res) => {
	res.status(200).json({ status: "ok" });
});

// Error handler (RFC 7807)
app.use(errorMiddleware);

module.exports = app;
