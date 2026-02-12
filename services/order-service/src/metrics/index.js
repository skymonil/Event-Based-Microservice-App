const client = require("prom-client");

const register = new client.Registry();

// Default Node.js / process metrics
client.collectDefaultMetrics({ register });

/* =========================
   HTTP METRICS
========================= */
const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency",
  labelNames: ["method", "route", "status"],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register]
});

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [register]
});

/* =========================
   BUSINESS METRICS (NEW)
========================= */
const ordersTotal = new client.Counter({
  name: "order_events_total",
  help: "Total number of order events (Created, Paid, Cancelled)",
  labelNames: ["status", "reason"], // e.g. status="CANCELLED", reason="PAYMENT_FAILED"
  registers: [register]
});

const orderValue = new client.Histogram({
  name: "order_value_dollars",
  help: "Value of orders created in dollars",
  buckets: [10, 50, 100, 200, 500, 1000], // Adjust buckets based on your pricing
  registers: [register]
});

/* =========================
   KAFKA METRICS
========================= */
const kafkaMessagesConsumed = new client.Counter({
  name: "kafka_messages_consumed_total",
  help: "Total Kafka messages consumed",
  labelNames: ["topic", "service", "status"], // Added 'status' (success/failure)
  registers: [register]
});

const kafkaDLQ = new client.Counter({
  name: "kafka_messages_dlq_total",
  help: "Kafka messages sent to DLQ",
  labelNames: ["topic", "service", "error_type"],
  registers: [register]
});

const consumerPaused = new client.Gauge({
  name: "kafka_consumer_paused",
  help: "Kafka consumer paused due to infra failure",
  labelNames: ["topic", "service"],
  registers: [register]
});

module.exports = {
  register,
  httpRequestDuration,
  httpRequestsTotal,
  ordersTotal,
  orderValue,
  kafkaMessagesConsumed,
  kafkaDLQ,
  consumerPaused
};