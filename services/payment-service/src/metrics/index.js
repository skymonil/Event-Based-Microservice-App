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
  registers: [register]
});

/* =========================
   KAFKA METRICS
========================= */
const kafkaMessagesConsumed = new client.Counter({
  name: "kafka_messages_consumed_total",
  help: "Total Kafka messages consumed",
  labelNames: ["topic", "service"],
  registers: [register]
});

const kafkaRetries = new client.Counter({
  name: "kafka_message_retries_total",
  help: "Kafka message retries",
  labelNames: ["topic", "service"],
  registers: [register]
});

const kafkaDLQ = new client.Counter({
  name: "kafka_messages_dlq_total",
  help: "Kafka messages sent to DLQ",
  labelNames: ["topic", "service"],
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
  kafkaMessagesConsumed,
  kafkaRetries,
  kafkaDLQ,
  consumerPaused
};
