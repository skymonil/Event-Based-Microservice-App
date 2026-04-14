// src/services/inventory.service.js
const inventoryQueries = require("../db/queries/inventory.queries");
const { AppError } = require("@my-app/common");
const { logger } = require("@my-app/common");
const db = require("../db/index");
const metrics = require("../metrics");
const { propagation, context, trace } = require("@opentelemetry/api");
const tracer = trace.getTracer("inventory-service");
/**
 * Create a new product in the catalog
 */

const SERVICE_NAME = process.env.SERVICE_NAME || "inventory-service";

const createProduct = async ({ id, name, sku }) => {
	const end = metrics.dbQueryDuration.startTimer({
		operation: "create_product",

		service: SERVICE_NAME,
	});

	const client = await db.connect();

	try {
		await client.query("BEGIN");

		// 1. Check for duplicates (Inside transaction for safety)
		const existing = await inventoryQueries.getProductById(id, client); // optimized to use client if possible
		if (existing) {
			metrics.dbErrors.inc({
				operation: "create_product",

				service: SERVICE_NAME,
			});
			logger.warn({ productId: id }, "Attempted to create duplicate product");
			throw new AppError({
				status: 409,
				detail: "Product with this ID already exists",
			});
		}

		// 2. Create in DB
		const newProduct = await inventoryQueries.createProduct(
			{ id, name, sku },
			client,
		);

		// 3. 📢 Emit 'product.created' for Redis Hydration
		await inventoryQueries.createOutboxEntry(
			{
				aggregate_type: "INVENTORY",
				aggregate_id: id,
				event_type: "product.created",
				payload: {
					event_type: "product.created",
					id,
					name,
					sku,
					stock: { total: 0, available: 0 },
				},
				metadata: {
					source: SERVICE_NAME,
				},
			},
			client,
		);

		await client.query("COMMIT");
		logger.info({ productId: id, sku }, "✅ Product created & Event emitted");
		return newProduct;
	} catch (err) {
		await client.query("ROLLBACK");
		throw err;
	} finally {
		end();
		client.release();
	}
};

/**
 * Adjust stock levels (SET or ADD)
 */
const adjustStock = async ({ productId, warehouseId, quantity, mode }) => {
	const end = metrics.dbQueryDuration.startTimer({
		operation: "adjust_stock",

		service: SERVICE_NAME,
	});

	const client = await db.connect();

	try {
		await client.query("BEGIN");

		// 1. Verify product existence (Locking row is safer but simple check works for now)
		const product = await inventoryQueries.getProductById(productId); // This query works without client too
		if (!product) {
			throw new AppError({ status: 404, detail: "Product not found" });
		}

		// 2. Update Postgres
		let result;
		if (mode === "SET") {
			result = await inventoryQueries.setStock(
				{ productId, warehouseId, quantity },
				client,
			);
		} else {
			result = await inventoryQueries.adjustStockIncrement(
				{ productId, warehouseId, quantity },
				client,
			);
		}
		metrics.stockAdjustments.inc({
			mode,

			service: SERVICE_NAME,
		});

		// 3. 📢 Emit 'stock.adjusted' for Redis Sync
		await inventoryQueries.createOutboxEntry(
			{
				aggregate_type: "INVENTORY",
				aggregate_id: productId,
				event_type: "stock.adjusted",

				payload: {
					event_type: "stock.adjusted",
					productId,
					total: result.total_quantity,
					available: result.available_quantity,
				},

				metadata: {
					source: "inventory-service",
				},
			},
			client,
		);

		await client.query("COMMIT");
		return result;
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		end();
		client.release();
	}
};

/**
 * Check if stock is sufficient (DB Fallback)
 */
const checkAvailability = async ({ productId, quantity, warehouseId }) => {
	const end = metrics.dbQueryDuration.startTimer({
		operation: "check_availability",

		service: SERVICE_NAME,
	});

	const requiredQty = parseInt(quantity, 10) || 1;
	// logger.debug({ productId, requiredQty, warehouseId }, "Checking stock availability (DB)");

	let availableCount = 0;

	if (warehouseId) {
		availableCount = await inventoryQueries.getStockLevel(
			productId,
			warehouseId,
		);
	} else {
		availableCount = await inventoryQueries.getGlobalStockLevel(productId);
	}
	metrics.availabilityChecks.inc({
		source: "db",

		service: SERVICE_NAME,
	});

	end();

	const isAvailable = availableCount >= requiredQty;

	if (!isAvailable) {
		logger.info(
			{ productId, requiredQty, availableCount },
			"⚠️ Stock check failed (Insufficient inventory)",
		);
	}

	return {
		productId,
		requestedQuantity: requiredQty,
		availableQuantity: availableCount,
		isAvailable,
		warehouseId: warehouseId || "ALL",
	};
};

/**
 * Get full product details + stock breakdown
 */
const getProductDetails = async (productId) => {
	const product = await inventoryQueries.getProductById(productId);
	if (!product) {
		throw new AppError({ status: 404, detail: "Product not found" });
	}
	const stockBreakdown = await inventoryQueries.getStockBreakdown(productId);
	return { ...product, stock: stockBreakdown };
};

/**
 * Get reservations for debugging
 */
const getReservationsByOrder = async (orderId) => {
	return await inventoryQueries.getReservationsByOrderId(orderId);
};

const reserveStock = async ({ orderId, items, totalAmount, userId }) => {
	return await tracer.startActiveSpan(
		"inventory.reserveStock",
		async (span) => {
			const client = await db.connect();

			try {
				const headers = {};
				propagation.inject(context.active(), headers || {});

				//Print Headers
				logger.debug({ headers }, "Tracing headers for reserveStock");
				await client.query("BEGIN");

				// 🛑 STEP 1: CLAIM ORDER
				const claim = await inventoryQueries.claimOrder(orderId, client);
				if (!claim) {
					await client.query("ROLLBACK");
					const existing =
						await inventoryQueries.getInventoryOrderStatus(orderId);

					if (existing && existing.status === "RESERVED") {
						logger.info(
							{ orderId },
							"♻️ Idempotency: Order already RESERVED. Skipping.",
						);
						return { success: true, isDuplicate: true };
					}
					if (existing && existing.status === "PROCESSING") {
						logger.warn(
							{ orderId },
							"⚠️ Concurrency: Order is locked by another consumer.",
						);
						return { success: true, isDuplicate: true };
					}
					return { success: false, reason: "ORDER_ALREADY_PROCESSED" };
				}

				// 🔄 STEP 2: RESERVE ITEMS
				const successfulReservations = [];

				for (const item of items) {
					const { productId, quantity } = item;

					// Business Rule
					if (quantity > 1000) {
						throw new AppError(
							400,
							"Bad Request",
							"Insufficient stock available",
							"/problems/insufficient-stock",
						);
					}

					let stockLocation;
					try {
						stockLocation = await inventoryQueries.findAndLockBestWarehouse(
							productId,
							quantity,
							client,
						);
					} catch (dbErr) {
						throw new InfraError(`Database unavailable: ${dbErr.message}`);
					}

					if (!stockLocation) {
						throw new AppError({ status: 409, detail: "Out of Stock" });
					}

					const { warehouse_id: warehouseId } = stockLocation;

					// Decrement Stock
					await inventoryQueries.decrementStock(
						{ productId, warehouseId, quantity },
						client,
					);

					// Create Reservation
					const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
					await inventoryQueries.createReservation(
						{ orderId, productId, warehouseId, quantity, expiresAt },
						client,
					);

					successfulReservations.push({
						productId,
						warehouseId,
						status: "RESERVED",
					});
				}

				// 📢 D. Outbox Event (The Critical Step)
				await inventoryQueries.createOutboxEntry(
					{
						aggregate_type: "INVENTORY",
						aggregate_id: orderId,
						event_type: "inventory.reserved",
						traceparent: headers.traceparent,
						tracestate: headers.tracestate,
						payload: {
							event_type: "inventory.reserved",
							orderId,
							userId, // Passed from consumer
							items: successfulReservations,
							status: "RESERVED",
							totalAmount,
						},

						metadata: {
							source: "inventory-service",
						},
					},
					client,
				);

				// ✅ STEP 3: MARK COMPLETE
				await inventoryQueries.updateOrderStatus(orderId, "RESERVED", client);

				await client.query("COMMIT");

				metrics.reservationCounter.inc({
					status: "success",
					service: SERVICE_NAME,
				});
				metrics.activeReservationsGauge.inc({
					service: SERVICE_NAME,
				});
				logger.info({ orderId }, "✅ Stock reserved & Order marked RESERVED");
				metrics.reservationCounter.inc({
					status: "success",
					reason: "none",
					service: SERVICE_NAME,
				});
				return { success: true };
			} catch (error) {
				await client.query("ROLLBACK");

				let reason = "system_error";
				if (error instanceof BusinessError) reason = "business_rule";
				else if (error.status === 409) reason = "out_of_stock";

				metrics.reservationCounter.inc({
					status: "failed",
					service: SERVICE_NAME,
				});

				// FAILURE HANDLER
				try {
					await inventoryQueries.transitionToFailed(orderId);
				} catch (updateErr) {
					logger.error(
						{ err: updateErr },
						"Failed to update order status to FAILED",
					);
				}

				logger.warn({ orderId, err: error.message }, "❌ Reservation failed");
				return { success: false, reason: error.detail || error.message };
			} finally {
				span.end();
				client.release();
			}
		},
	);
};

/**
 * COMPENSATING ACTION: Release Stock
 */
const releaseStock = async (orderId) => {
	const extractedContext = propagation.extract(context.active(), {});
	return await context.with(extractedContext, async () =>
		tracer.startActiveSpan("inventory.releaseStock", async (span) => {
			const headers = {};
			propagation.inject(context.active(), headers || {});
			span.setAttribute("order.id", orderId);
			logger.info({ orderId }, "Starting stock release process");

			const client = await db.connect();
			try {
				await client.query("BEGIN");

				const reservations = await inventoryQueries.lockReservationsByOrderId(
					orderId,
					client,
				);

				if (!reservations || reservations.length === 0) {
					await client.query("ROLLBACK");
					logger.info({ orderId }, "ℹ️ No reservations found to release");
					return;
				}

				let itemsReleased = 0;
				const releasedDetails = [];

				for (const res of reservations) {
					if (res.status !== "RESERVED") continue;

					await inventoryQueries.incrementStock(
						{
							productId: res.product_id,
							warehouseId: res.warehouse_id,
							quantity: res.quantity,
						},
						client,
					);

					await inventoryQueries.updateReservationStatus(
						res.id,
						"RELEASED",
						client,
					);
					itemsReleased++;
					releasedDetails.push({
						productId: res.product_id,
						warehouseId: res.warehouse_id,
					});
				}

				if (itemsReleased > 0) {
					await inventoryQueries.updateOrderStatus(orderId, "RELEASED", client);

					// 📢 Emit Released Event for Redis Sync
					await inventoryQueries.createOutboxEntry(
						{
							aggregate_type: "INVENTORY",
							aggregate_id: orderId,
							event_type: "inventory.released",
							traceparent: headers.traceparent,
							tracestate: headers.tracestate,
							payload: {
								event_type: "inventory.released",
								orderId,
								reason: "Payment Failed / Cancelled",
								items: releasedDetails,
							},

							metadata: {
								source: "inventory-service",
							},
						},
						client,
					);
				}

				await client.query("COMMIT");
				metrics.releaseCounter.inc({
					trigger: "payment_failed",

					service: SERVICE_NAME,
				});
				logger.info(
					{ orderId, count: itemsReleased },
					"✅ Stock release cycle completed",
				);
			} catch (err) {
				await client.query("ROLLBACK");
				logger.error({ err, orderId }, "❌ Failed to release stock");
				throw err;
			} finally {
				client.release();
				span.end();
			}
		}),
	);
};

const handleReservationFailed = async ({ orderId, reason }) => {
	const extractedContext = propagation.extract(context.active(), {});
	return await context.with(extractedContext, async () => {
		return await tracer.startActiveSpan(
			"inventory.handleReservationFailed",
			async (span) => {
				const client = await db.connect();
				try {
					const headers = {};
					propagation.inject(context.active(), headers || {});
					span.setAttribute("order.id", orderId);
					span.setAttribute("failure.reason", reason);
					logger.warn(
						{ orderId, reason },
						"📢 Publishing 'inventory.reservation.failed' event",
					);

					await inventoryQueries.createOutboxEntry(
						{
							aggregate_type: "INVENTORY",
							aggregate_id: orderId,
							event_type: "inventory.reservation.failed",
							traceparent: headers.traceparent,
							tracestate: headers.tracestate,
							payload: { orderId, reason },
							metadata: { source: "inventory-service" },
						},
						client,
					);
				} catch (err) {
					logger.error(
						{ err, orderId },
						"🔥 Failed to write failure event to outbox",
					);
					throw err;
				} finally {
					client.release();
					span.end();
				}
			},
		);
	});
};

module.exports = {
	createProduct,
	adjustStock,
	checkAvailability,
	getProductDetails,
	getReservationsByOrder,
	reserveStock,
	releaseStock,
	handleReservationFailed,
};
