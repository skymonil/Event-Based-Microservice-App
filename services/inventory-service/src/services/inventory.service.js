// src/services/inventory.service.js
const inventoryQueries = require("../db/queries/inventory.queries");
const AppError = require("../utils/app-error");
const { logger } = require("../utils/logger");
const db = require("../index"); // Ensure DB is imported for transactions

/**
 * Create a new product in the catalog
 */
const createProduct = async ({ id, name, sku }) => {
  // Logic: Check for duplicates
  const existing = await inventoryQueries.getProductById(id);
  if (existing) {
    logger.warn({ productId: id }, "Attempted to create duplicate product");
    throw new AppError({
      status: 409,
      detail: "Product with this ID already exists",
    });
  }

  const newProduct = await inventoryQueries.createProduct({ id, name, sku });
  logger.info({ productId: id, sku }, "✅ Product created successfully");
  return newProduct;
};

/**
 * Adjust stock levels (SET or ADD)
 */
const adjustStock = async ({ productId, warehouseId, quantity, mode }) => {
  // Logic: Verify product existence
  const product = await inventoryQueries.getProductById(productId);
  if (!product) {
    throw new AppError({ status: 404, detail: "Product not found" });
  }

  logger.info(
    { productId, warehouseId, quantity, mode },
    "⚖️ Initiating stock adjustment"
  );

  let result;
  // Logic: Decide operation type
  if (mode === "SET") {
    result = await inventoryQueries.setStock({
      productId,
      warehouseId,
      quantity,
    });
  } else {
    // Default is ADD (increment/decrement)
    result = await inventoryQueries.adjustStockIncrement({
      productId,
      warehouseId,
      quantity,
    });
  }

  // Debug log for the exact new levels (useful for tracing math errors)
  logger.debug(
    { 
      warehouseId, 
      newTotal: result.total_quantity, 
      newAvailable: result.available_quantity 
    }, 
    "Stock levels updated"
  );

  return result;
};

/**
 * Check if stock is sufficient
 */
const checkAvailability = async ({ productId, quantity, warehouseId }) => {
  const requiredQty = parseInt(quantity, 10) || 1;
  
  // Use DEBUG level here to prevent flooding logs in production
  logger.debug({ productId, requiredQty, warehouseId }, "Checking stock availability");

  let availableCount = 0;

  // Logic: Determine scope (Global vs Local)
  if (warehouseId) {
    availableCount = await inventoryQueries.getStockLevel(productId, warehouseId);
  } else {
    availableCount = await inventoryQueries.getGlobalStockLevel(productId);
  }

  const isAvailable = availableCount >= requiredQty;

  // Log only if stock is LOW or MISSING (Operational insight)
  if (!isAvailable) {
    logger.info(
      { productId, requiredQty, availableCount }, 
      "⚠️ Stock check failed (Insufficient inventory)"
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

  // Logic: Aggregation
  const stockBreakdown = await inventoryQueries.getStockBreakdown(productId);

  return {
    ...product,
    stock: stockBreakdown,
  };
};

/**
 * Get reservations for debugging
 */
const getReservationsByOrder = async (orderId) => {
  return await inventoryQueries.getReservationsByOrderId(orderId);
};

/**
 * CORE SAGA LOGIC: Reserve Stock
 */
const reserveStock = async ({ orderId, productId, quantity }) => {
  // 🛡️ 1. Global Idempotency Check
  const existingRes = await inventoryQueries.getReservationByOrderAndProduct(
    orderId, 
    productId
  );
  
  if (existingRes) {
    logger.info({ orderId, warehouseId: existingRes.warehouse_id }, "♻️ Idempotency: Reservation already exists, skipping.");
    return { success: true, isDuplicate: true, warehouseId: existingRes.warehouse_id };
  }

  // 🔄 2. Retry Logic
  let attempts = 0;
  const MAX_RETRIES = 3;

  while (attempts < MAX_RETRIES) {
    attempts++;
    const client = await db.connect();

    try {
      // A. Sourcing
      const stockLocation = await inventoryQueries.findWarehouseWithStock(productId, quantity);
      
      if (!stockLocation) {
        logger.warn({ orderId, productId, quantity }, "❌ Reservation failed: Out of Stock globally");
        return { success: false, reason: "OUT_OF_STOCK" };
      }

      const { warehouse_id: warehouseId } = stockLocation;

      await client.query("BEGIN");

      // B. Atomic Decrement
      const updatedStock = await inventoryQueries.decrementStock(
        { productId, warehouseId, quantity }, 
        client
      );

      if (!updatedStock) {
        await client.query("ROLLBACK");
        logger.warn({ orderId, attempt: attempts }, "⚠️ Concurrency contention detected (Race Condition). Retrying...");
        continue; 
      }

      // C. Create Reservation
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); 
      await inventoryQueries.createReservation(
        { orderId, productId, warehouseId, quantity, expiresAt }, 
        client
      );

      // D. Outbox Event
      await inventoryQueries.createOutboxEntry({
        aggregate_type: "INVENTORY",
        aggregate_id: orderId,
        event_type: "inventory.reserved",
        payload: { orderId, productId, warehouseId, status: "RESERVED" },
        metadata: { source: "inventory-service" }
      }, client);

      await client.query("COMMIT");
      
      logger.info({ orderId, warehouseId }, "✅ Stock reserved successfully");
      return { success: true, warehouseId };

    } catch (error) {
      await client.query("ROLLBACK");
      logger.error({ err: error, orderId }, "🔥 Critical error during reservation transaction");
      throw error; 
    } finally {
      client.release();
    }
  }

  logger.error({ orderId }, "❌ Reservation failed after max retries due to high concurrency");
  return { success: false, reason: "HIGH_CONCURRENCY_FAILURE" };
};

/**
 * COMPENSATING ACTION: Release Stock
 */
const releaseStock = async (orderId) => {
  const reservations = await inventoryQueries.getReservationsByOrderId(orderId);

  if (!reservations || reservations.length === 0) {
    logger.info({ orderId }, "ℹ️ No reservations found to release (Idempotent or never reserved)");
    return;
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    for (const res of reservations) {
      if (res.status === 'RELEASED') continue; 

      logger.info({ orderId, warehouseId: res.warehouse_id }, "↩️ Releasing stock back to warehouse");

      // A. Return stock
      await inventoryQueries.incrementStock(
        { productId: res.product_id, warehouseId: res.warehouse_id, quantity: res.quantity },
        client
      );

      // B. Update status
      await inventoryQueries.updateReservationStatus(res.id, 'RELEASED', client);
    }

    await client.query("COMMIT");
    logger.info({ orderId }, "✅ Stock release cycle completed");

  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err, orderId }, "🔥 Failed to release stock");
    throw err;
  } finally {
    client.release();
  }
};

/**
 * FAILURE SIGNAL: Notify Order Service that stock is missing
 */
const handleReservationFailed = async ({ orderId, reason }) => {
  const client = await db.connect();
  try {
    logger.warn({ orderId, reason }, "📢 Publishing 'inventory.reservation.failed' event to Outbox");

    await inventoryQueries.createOutboxEntry({
      aggregate_type: "INVENTORY",
      aggregate_id: orderId,
      event_type: "inventory.reservation.failed",
      payload: { orderId, reason },
      metadata: { source: "inventory-service" }
    }, client);
    
  } catch (err) {
    logger.error({ err, orderId }, "🔥 Failed to write failure event to outbox");
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  createProduct,
  adjustStock,
  checkAvailability,
  getProductDetails,
  getReservationsByOrder,
  reserveStock,
  releaseStock,
  handleReservationFailed
};