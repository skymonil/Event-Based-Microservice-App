//src/redis/stock-projection.consumer.js
const kafka = require("../kafka");
const redis = require("./client");
const { logger } = require("@my-app/common");
const { extractKafkaContext } = require("../tracing/kafka-context");
const consumer = kafka.consumer({
	groupId: "inventory-stock-projection",
});
const metrics = require("../metrics");

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "inventory-service";

const { context, propagation, trace } = require("@opentelemetry/api");
const tracer = trace.getTracer("inventory-redis-projection");

const startRedisProjection = async () => {
	let connected = false;
	// 🛡️ Retry Loop for Infra startup
	while (!connected) {
		try {
			await consumer.connect();
			await consumer.subscribe({
				topics: [
					"product.created",
					"inventory.reserved",
					"inventory.released",
					"inventory.expired",
					"stock.adjusted",
				],
				fromBeginning: false, // 🔥 allows rebuild
			});

			connected = true;
			logger.info(
				"✅ Redis Stock Projection Consumer connected and subscribed",
			);
		} catch (err) {
			logger.error({ err }, "❌ Failed to connect to Kafka, retrying in 5s...");
			await new Promise((r) => setTimeout(r, 5000));
		}
	}

	await consumer.run({
		eachMessage: async ({ topic, message }) => {
			// 1. Parse payload
			const payload = JSON.parse(message.value.toString());
			const extractedContext = extractKafkaContext(message);

			// 1. Try to find Tracing Data in the Headers (Where Debezium put it)

			const eventType = payload.event_type;
			const { items, orderId } = payload;

			logger.info({ eventType, payload }, "📥 Redis Consumer received event");

			// 3. Wrap in Context and Span
			await context.with(extractedContext, async () => {
				await tracer.startActiveSpan(`process ${eventType}`, async (span) => {
					span.setAttribute("event.type", eventType);
					span.setAttribute("order.id", orderId || "N/A");

					try {
						switch (eventType) {
							case "product.created":
								await createProductInRedis(payload);
								break;

							case "inventory.reserved":
								await decrementStock(items);
								break;

							case "inventory.released":
							case "inventory.expired":
								await incrementStock(items);
								break;

							case "stock.adjusted":
								await resetStock(payload);
								break;

							default:
								logger.debug({ eventType }, "Skipping unknown event type");
						}
					} catch (err) {
						span.recordException(err);
						span.setStatus({ code: 2, message: err.message }); // 2 = Error status
						logger.error({ err, eventType }, "Redis projection failed");
						throw err; // Re-throw to trigger KafkaJS retry logic
					} finally {
						span.end();
					}
				});
			});
		},
	});
};

const decrementStock = async (items) => {
	for (const item of items) {
		const end = metrics.redisLatency.startTimer({
			operation: "decrement",
			service: SERVICE_NAME,
		});
		const key = `stock:product:${item.productId}`;
		try {
			await redis.multi().hincrby(key, "available", -item.quantity).exec();

			metrics.redisOperations.inc({
				operation: "decrement",

				status: "success",
				service: SERVICE_NAME,
			});
		} catch (err) {
			metrics.redisOperations.inc({
				operation: "decrement",

				status: "error",
				service: SERVICE_NAME,
			});

			throw err;
		} finally {
			end({
				service: SERVICE_NAME,
			});
		}
	}
};
const incrementStock = async (items) => {
	for (const item of items) {
		const end = metrics.redisLatency.startTimer({
			operation: "increment",
			service: SERVICE_NAME,
		});
		const key = `stock:product:${item.productId}`;
		try {
			await redis.multi().hincrby(key, "available", item.quantity).exec();

			metrics.redisOperations.inc({
				operation: "increment",
				status: "success",
				service: SERVICE_NAME,
			});
		} catch (err) {
			metrics.redisOperations.inc({
				operation: "increment",
				status: "error",
				service: SERVICE_NAME,
			});

			throw err;
		} finally {
			end();
		}
	}
};

const resetStock = async ({ productId, total, available }) => {
	const key = `stock:product:${productId}`;

	await redis.hmset(key, {
		total,
		available,
	});
};

// Add this helper to store static data
const createProductInRedis = async ({ id, name, sku, stock }) => {
	const key = `stock:product:${id}`;
	await redis.hmset(key, {
		id,
		name,
		sku,
		total: stock.total,
		available: stock.available,
	});
};
module.exports = { startRedisProjection };
