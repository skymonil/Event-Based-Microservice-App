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
 * CORE SAGA LOGIC: Reserve Stock (Multi-Item Support)
 * * Strategy: "Split Shipment" allowed.
 * We find the best warehouse for EACH item independently.
 * However, the Reservation itself is ATOMIC (All items or None).
 */
// src/services/inventory.service.js

const reserveStock = async ({ orderId, items }) => {
  // 🟢 1. Connect ONCE (Single Connection for the whole lifecycle)
  const client = await db.connect();

  try {
    // 🟢 2. Start Transaction (The Safety Net)
    await client.query("BEGIN");

    // ====================================================
    // 🛑 STEP 1: CLAIM ORDER (Idempotency Gate)
    // ====================================================
    // We try to insert 'PROCESSING'. 
    // If it fails, it means another thread/consumer is already working on it 
    // or it is already finished.
    // NOTE: passing 'client' here is critical to lock it within this transaction.
    const claim = await inventoryQueries.claimOrder(orderId, client);

    if (!claim) {
      // ⚠️ Concurrency Handling
      // We failed to claim. Release OUR transaction attempt immediately.
      await client.query("ROLLBACK"); 
      
      // Now check the status (Read-Only check doesn't need the transaction lock)
      const existing = await inventoryQueries.getInventoryOrderStatus(orderId);
      
      if (existing && existing.status === 'RESERVED') {
         logger.info({ orderId }, "♻️ Idempotency: Order already RESERVED. Skipping.");
         return { success: true, isDuplicate: true };
      }
      
      if (existing && existing.status === 'PROCESSING') {
         logger.warn({ orderId }, "⚠️ Concurrency: Order is locked by another consumer. Skipping.");
         return { success: true, isDuplicate: true }; 
      }

      // If 'FAILED' or 'RELEASED', typically we stop here to prevent "Zombie" retries.
      return { success: false, reason: "ORDER_ALREADY_PROCESSED" };
    }

    // ====================================================
    // 🔄 STEP 2: RESERVE ITEMS (The Atomic Loop)
    // ====================================================
    // If we are here, we own the 'PROCESSING' lock in this transaction.
    
    const successfulReservations = [];

    // Loop through items
    for (const item of items) {
      const { productId, quantity } = item;

      // A. Lock & Source
      // We use the SAME client to maintain the transaction lock
      const stockLocation = await inventoryQueries.findAndLockBestWarehouse(
        productId, 
        quantity, 
        client
      );

      if (!stockLocation) {
        throw new AppError({ status: 409, detail: `Out of Stock: ${productId}` });
      }

      const { warehouse_id: warehouseId } = stockLocation;

      // B. Decrement Stock
      await inventoryQueries.decrementStock(
        { productId, warehouseId, quantity }, 
        client
      );

      // C. Insert Reservation Record
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await inventoryQueries.createReservation(
        { orderId, productId, warehouseId, quantity, expiresAt },
        client
      );

      successfulReservations.push({ productId, warehouseId, status: "RESERVED" });
    }

    // D. Outbox Event
    await inventoryQueries.createOutboxEntry({
      aggregate_type: "INVENTORY",
      aggregate_id: orderId,
      event_type: "inventory.reserved",
      payload: { orderId, items: successfulReservations, status: "RESERVED" },
      metadata: { source: "inventory-service" }
    }, client);

    // ====================================================
    // ✅ STEP 3: MARK AS COMPLETE
    // ====================================================
    // Update the status row we inserted in Step 1
    await inventoryQueries.updateOrderStatus(orderId, 'RESERVED', client);

    await client.query("COMMIT");
    logger.info({ orderId }, "✅ Stock reserved & Order marked RESERVED");
    return { success: true };

  } catch (error) {
    // 🔴 ROLLBACK
    // This undoes EVERYTHING: The stock decrements, the reservations, 
    // AND the 'PROCESSING' insert from Step 1.
    await client.query("ROLLBACK");
    
    // ====================================================
    // ❌ FAILURE HANDLER (Post-Rollback)
    // ====================================================
    // Since we rolled back, the 'PROCESSING' row is gone. 
    // We want to record that this order FAILED so we don't retry it infinitely.
    // We need a NEW, short transaction just for this status update.
    try {
        await inventoryQueries.claimOrder(orderId); // Re-insert row (autocommit)
        await inventoryQueries.updateOrderStatus(orderId, 'FAILED'); // Mark failed
    } catch (updateErr) {
        logger.error({ err: updateErr }, "Failed to update order status to FAILED");
    }

    logger.warn({ orderId, err: error.message }, "❌ Reservation failed");
    return { success: false, reason: error.detail || "Transaction Failed" };
  } finally {
    client.release();
  }
};

/**
 * COMPENSATING ACTION: Release Stock
 * Called when Payment Fails or Order is Cancelled.
 * * 🔒 SECURITY FIX: 
 * Only 'RESERVED' items can be released. 
 * If status is 'CONFIRMED', 'SHIPPED', or 'RELEASED', we must ignore.
 */
const releaseStock = async (orderId) => {
   // 🟢 1. Connect
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // ====================================================
    // 🔒 STEP 1: FETCH & LOCK (The Fix)
    // ====================================================
    // "FOR UPDATE" stops Consumer B here until we Commit.
    // When Consumer B finally unblocks, it will read the UPDATED rows.
    const reservations = await inventoryQueries.lockReservationsByOrderId(orderId, client);

  if (!reservations || reservations.length === 0) {
    logger.info({ orderId }, "ℹ️ No reservations found to release (Idempotent)");
    return;
  }

  
  
    await client.query("BEGIN");

    let itemsReleased = 0;
    const releasedDetails = [];

    for (const res of reservations) {
     // ====================================================
      // 🛡️ STEP 2: STATE CHECK (Now Thread-Safe)
      // ====================================================
      // Because we hold the lock, we are GUARANTEED that 'res.status'
      // is the absolute latest truth. No one else can be changing it right now.
       if (res.status !== 'RESERVED') {
        // If Consumer A already released it, Consumer B sees 'RELEASED' here and skips.
        // Or if it was SHIPPED, we skip.
        continue; 
      }
      logger.info({ orderId, warehouseId: res.warehouse_id }, "↩️ Releasing stock back to warehouse");

      // A. Return stock to "Available" pile
      await inventoryQueries.incrementStock(
        { productId: res.product_id, warehouseId: res.warehouse_id, quantity: res.quantity },
        client
      );

      // B. Mark reservation as RELEASED
      await inventoryQueries.updateReservationStatus(res.id, 'RELEASED', client);
      itemsReleased++;
      releasedDetails.push({ productId: res.product_id, warehouseId: res.warehouse_id });
    }

    // C. Sync Order-Level Status (The new table we added)
    // Only mark order as 'RELEASED' if we actually released items.
   if (itemsReleased > 0) {
      await inventoryQueries.updateOrderStatus(orderId, 'RELEASED', client);

      await inventoryQueries.createOutboxEntry({
        aggregate_type: "INVENTORY",
        aggregate_id: orderId,
        event_type: "inventory.released",
        payload: { 
          orderId, 
          reason: "Payment Failed / Cancelled", 
          items: releasedDetails 
        },
        metadata: { source: "inventory-service" }
      }, client);
    } else {
       logger.info({ orderId }, "ℹ️ Order processed, but no items needed releasing (already released or shipped).");
    }

    await client.query("COMMIT");
    logger.info({ orderId, count: itemsReleased }, "✅ Stock release cycle completed");

  }
  catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err, orderId }, "❌ Failed to release stock, transaction rolled back");
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