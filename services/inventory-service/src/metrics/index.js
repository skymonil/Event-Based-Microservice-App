const client = require("prom-client");

const register = new client.Registry();

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "inventory-service";

/*
================================
Default Runtime Metrics
================================
*/

client.collectDefaultMetrics({
	register,
	prefix: "node_",
});

/*
================================
HTTP (RED metrics)
================================
*/

const httpRequestsTotal = new client.Counter({
	name: "http_requests_total",

	help: "Total HTTP requests",

	labelNames: ["method", "route", "status", "service"],

	registers: [register],
});

const httpRequestDuration = new client.Histogram({
	name: "http_request_duration_seconds",

	help: "HTTP latency",

	labelNames: ["method", "route", "status", "service"],

	buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],

	registers: [register],
});

/*
================================
Inventory domain metrics
================================
*/

const reservationCounter = new client.Counter({
	name: "inventory_reservations_total",

	help: "Stock reservation attempts",

	labelNames: ["status", "reason", "service"],

	registers: [register],
});

const releaseCounter = new client.Counter({
	name: "inventory_releases_total",

	help: "Stock release operations",

	labelNames: ["trigger", "service"],

	registers: [register],
});

const activeReservationsGauge = new client.Gauge({
	name: "inventory_active_reservations",

	help: "Currently active reservations",

	labelNames: ["service"],

	registers: [register],
});

const stockAdjustments = new client.Counter({
	name: "inventory_stock_adjustments_total",

	help: "Stock adjustments",

	labelNames: ["mode", "service"],

	registers: [register],
});

const availabilityChecks = new client.Counter({
	name: "inventory_availability_checks_total",

	help: "Availability checks",

	labelNames: ["source", "service"],

	registers: [register],
});

/*
================================
Redis CQRS metrics
================================
*/

const redisOperations = new client.Counter({
	name: "redis_operations_total",

	help: "Redis operations",

	labelNames: ["operation", "status", "service"],

	registers: [register],
});

const redisLatency = new client.Histogram({
	name: "redis_operation_duration_seconds",

	help: "Redis latency",

	labelNames: ["operation", "service"],

	buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.3],

	registers: [register],
});

/*
================================
Kafka consumer metrics
================================
*/

const kafkaMessagesConsumed = new client.Counter({
	name: "kafka_messages_consumed_total",

	help: "Kafka messages consumed",

	labelNames: ["topic", "status", "service"],

	registers: [register],
});

const kafkaDLQ = new client.Counter({
	name: "kafka_dlq_messages_total",

	help: "Messages sent to DLQ",

	labelNames: ["topic", "error_type", "service"],

	registers: [register],
});

const kafkaConsumerLag = new client.Gauge({
	name: "kafka_consumer_lag",

	help: "Kafka lag",

	labelNames: ["topic", "service"],

	registers: [register],
});

/*
================================
Database metrics
================================
*/

const dbQueryDuration = new client.Histogram({
	name: "db_query_duration_seconds",

	help: "DB latency",

	labelNames: ["operation", "service"],

	buckets: [0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1],

	registers: [register],
});

const dbErrors = new client.Counter({
	name: "db_errors_total",

	help: "DB errors",

	labelNames: ["operation", "service"],

	registers: [register],
});

module.exports = {
	register,

	httpRequestsTotal,
	httpRequestDuration,

	reservationCounter,
	releaseCounter,
	activeReservationsGauge,
	stockAdjustments,
	availabilityChecks,

	redisOperations,
	redisLatency,

	kafkaMessagesConsumed,
	kafkaDLQ,
	kafkaConsumerLag,

	dbQueryDuration,
	dbErrors,
};
