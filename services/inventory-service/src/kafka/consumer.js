// services/inventory-service/src/kafka/consumer.js
const { Kafka } = require("kafkajs");
const { trace, context } = require("@opentelemetry/api");
const inventoryService = require("../services/inventory.service");
const { logger } = require("@my-app/common");
const { AppError } = require("@my-app/common");
const { extractKafkaContext } = require("../tracing/kafka-context");
const metrics = require("../metrics");
const kafka = new Kafka({
	clientId: "inventory-service",
	brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
	retry: {
		initialRetryTime: 300, // Wait 300ms
		retries: 10, // Try 10 times before crashing
	},
});
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "inventory-service";

const consumer = kafka.consumer({
	groupId: "inventory-group",
	sessionTimeout: 30000,
	heartbeatInterval: 3000,
	rebalanceTimeout: 60000,
});
const tracer = trace.getTracer("inventory-consumer");

const startConsumer = async () => {
	let connected = false;

	// 🛡️ Retry Loop for Infra startup
	while (!connected) {
		try {
			await consumer.connect();
			// Subscribe to relevant topics
			await consumer.subscribe({
				topics: [
					"order.created",
					"payment.failed",
					"order.cancelled",
					"payment.refunded",
				],
				fromBeginning: false,
				allowAutoTopicCreation: true,
			});
			connected = true;
			logger.info("✅ Inventory Consumer connected and subscribed");
		} catch (err) {
			logger.error({ err }, "❌ Failed to connect to Kafka, retrying in 5s...");
			await new Promise((r) => setTimeout(r, 5000));
		}
	}

	await consumer.run({
		eachMessage: async ({ topic, partition, message }) => {
			const payload = JSON.parse(message.value.toString());
			const extractedContext = extractKafkaContext(message);

			orderId = payload.orderId || "unknown";

			await context.with(extractedContext, async () => {
				await tracer.startActiveSpan(`process ${topic}`, async (span) => {
					try {
						span.setAttribute("messaging.system", "kafka");
						span.setAttribute("messaging.destination", topic);
						span.setAttribute("order.id", payload.orderId || "N/A");

						const { orderId } = payload;

						span.setAttribute("order.id", orderId);
						span.setAttribute("kafka.topic", topic);

						logger.info({ topic, orderId }, "Processing Kafka message");

						switch (topic) {
							case "order.created":
								// 📦 SAGA STEP 1: Try to reserve stock
								await handleOrderCreated(payload);
								break;

							case "payment.failed":
							case "order.cancelled":
							case "payment.refunded":
								// ↩️ SAGA COMPENSATION: Release stock
								await handleReleaseStock(payload);
								break;

							default:
								logger.warn({ topic }, "Received message for unknown topic");
						}
						metrics.kafkaMessagesConsumed.inc({
							topic,

							status: "success",

							service: SERVICE_NAME,
						});
					} catch (err) {
						span.recordException(err);
						metrics.kafkaMessagesConsumed.inc({
							topic,

							status: "failure",

							service: SERVICE_NAME,
						});
						// ====================================================
                        // 🛡️ ERROR CLASSIFICATION & RETRY STRATEGY (DUCK TYPING)
                        // ====================================================

                        // If the error has a status property, we treat it as an AppError
                        const isAppError = err && err.status !== undefined;

                        const errorDetails = isAppError ? err.detail : err.message;
                        const statusCode = isAppError ? err.status : 500;

                        // 🛑 CASE A: Non-Retryable Error (Business Logic / 4xx)
                        // Examples: "Invalid Product ID", "Order already Cancelled", "Validation Error"
                        if (isAppError && statusCode >= 400 && statusCode < 500) 

						 {

							logger.warn(
								{ orderId, topic, err: errorDetails },
								"⛔ Non-Retryable Error (Business Logic). Dropping message to avoid Retry Storm.",
							);

							// TODO: In a real prod env, send to a 'Dead Letter Queue' (DLQ) topic here.

							// RETURN means "Success" to Kafka. It commits the offset and moves on.
							return;
						}

						// 🔄 CASE B: Retryable Error (Infra / 5xx / Unknown)
						// Examples: "DB Timeout", "Network Glitch", "Unhandled Crash"
						logger.error(
							{ orderId, topic, err: errorDetails },
							"❌ Infrastructure/System Error. Triggering Kafka Retry...",
						);

						// THROWING tells Kafka "I failed".
						// Kafka will pause partition consumption based on your retry policy (backoff).
						throw err;
					} finally {
						// ✅ FIX 1: Ensure span ends whether it succeeded or failed
						span.end();
					}
				});
			});
		},
	});
};

/**
 * Handler for 'order.created'
 */

const handleOrderCreated = async (payload) => {
	const { orderId, items, totalAmount, userId } = payload;

	if (!items || items.length === 0) {
		logger.warn({ orderId }, "⚠️ Order created with no items");
		return;
	}

	// ✅ Pass the WHOLE array now
	const result = await inventoryService.reserveStock({
		orderId,
		items,
		totalAmount,
		userId,
	});

	if (!result.success) {
		logger.warn(
			{ orderId, reason: result.reason },
			"Reservation failed, triggering compensation",
		);

		await inventoryService.handleReservationFailed({
			orderId,
			reason: result.reason,
		});
	}
};

/**
 * Handler for cleanup (Payment Failed / User Cancelled)
 */
const handleReleaseStock = async (payload) => {
	const { orderId } = payload;
	await inventoryService.releaseStock(orderId);
	metrics.activeReservationsGauge.dec({
		service: SERVICE_NAME,
	});
};

module.exports = { startConsumer };
