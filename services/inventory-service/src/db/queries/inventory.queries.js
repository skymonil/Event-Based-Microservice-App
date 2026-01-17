// src/db/queries/inventory.queries.js
const db = require("../index");

/**
 * 1. Product Management
 */
const createProduct = async ({ id, name, sku }) => {
  const result = await db.query(
    `INSERT INTO products (id, name, sku) 
     VALUES ($1, $2, $3) 
     RETURNING *`,
    [id, name, sku]
  );
  return result.rows[0];
};

const getProductById = async (id) => {
  const result = await db.query(
    `SELECT * FROM products WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * 2. Stock Management (Upserts)
 */

// Mode: SET (Absolute override)
// Uses ON CONFLICT to handle "Insert if new, Update if exists"
const setStock = async ({ productId, warehouseId, quantity }) => {
  const result = await db.query(
    `
    INSERT INTO inventory_stock (product_id, warehouse_id, total_quantity, available_quantity)
    VALUES ($1, $2, $3, $3)
    ON CONFLICT (product_id, warehouse_id) 
    DO UPDATE SET 
      total_quantity = EXCLUDED.total_quantity,
      available_quantity = EXCLUDED.available_quantity,
      updated_at = NOW()
    RETURNING *
    `,
    [productId, warehouseId, quantity]
  );
  return result.rows[0];
};

// Mode: ADD (Incremental)
// If row doesn't exist, it inserts the quantity as the starting value.
// If row exists, it adds the quantity to current values.
const adjustStockIncrement = async ({ productId, warehouseId, quantity }) => {
  const result = await db.query(
    `
    INSERT INTO inventory_stock (product_id, warehouse_id, total_quantity, available_quantity)
    VALUES ($1, $2, $3, $3)
    ON CONFLICT (product_id, warehouse_id) 
    DO UPDATE SET 
      total_quantity = inventory_stock.total_quantity + $3,
      available_quantity = GREATEST(inventory_stock.available_quantity + $3, 0),
      updated_at = NOW()
    RETURNING *
    `,
    [productId, warehouseId, quantity]
  );
  return result.rows[0];
};

/**
 * 3. Availability Checks
 */

// Get stock for a specific warehouse
const getStockLevel = async (productId, warehouseId) => {
  const result = await db.query(
    `
    SELECT available_quantity 
    FROM inventory_stock 
    WHERE product_id = $1 AND warehouse_id = $2
    `,
    [productId, warehouseId]
  );
  return result.rows[0] ? result.rows[0].available_quantity : 0;
};

// Get global stock (Sum of all warehouses)
const getGlobalStockLevel = async (productId) => {
  const result = await db.query(
    `
    SELECT COALESCE(SUM(available_quantity), 0)::int as total_available
    FROM inventory_stock 
    WHERE product_id = $1
    `,
    [productId]
  );
  return result.rows[0].total_available;
};

// Get detailed breakdown per warehouse (Joined with Warehouse names)
const getStockBreakdown = async (productId) => {
  const result = await db.query(
    `
    SELECT 
      w.id as warehouse_id,
      w.name as warehouse_name,
      w.region,
      s.total_quantity,
      s.available_quantity
    FROM inventory_stock s
    JOIN warehouses w ON s.warehouse_id = w.id
    WHERE s.product_id = $1
    ORDER BY s.available_quantity DESC
    `,
    [productId]
  );
  return result.rows;
};

/**
 * 4. Reservations (Debugging)
 */
const getReservationsByOrderId = async (orderId) => {
  const result = await db.query(
    `
    SELECT 
      r.id,
      r.status,
      r.quantity,
      r.created_at,
      r.expires_at,
      w.name as warehouse_name,
      p.name as product_name
    FROM inventory_reservations r
    JOIN warehouses w ON r.warehouse_id = w.id
    JOIN products p ON r.product_id = p.id
    WHERE r.order_id = $1
    `,
    [orderId]
  );
  return result.rows;
};

/**
 * 4. Reservation & Saga Logic
 */

// A. Outbox Pattern
const createOutboxEntry = async (entry, client) => {
  const { aggregate_type, aggregate_id, event_type, payload, metadata } = entry;
  await client.query(
    `INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [aggregate_type, aggregate_id, event_type, payload, metadata]
  );
};

// B. Sourcing: Find which warehouse has enough stock
// Strategy: Pick the warehouse with the MOST stock (Load Balancing)
// 🚀 RENAMED & IMPROVED: Matching the Service Call
// Strategy: Pick the warehouse with the MOST stock (Load Balancing)
const findAndLockBestWarehouse = async (productId, requiredQty, client) => {
  // NOTE: You MUST pass 'client' here because this lock is bound to the transaction.
  // If you use 'db.query', the lock releases immediately, defeating the purpose.
  const dbClient = client || db; 

  const result = await dbClient.query(
    `
    SELECT warehouse_id, available_quantity 
    FROM inventory_stock
    WHERE product_id = $1 AND available_quantity >= $2
    ORDER BY available_quantity DESC -- Optimization: Pick the warehouse with MOST items first
    LIMIT 1
    FOR UPDATE SKIP LOCKED
    `,
    [productId, requiredQty]
  );
  return result.rows[0]; 
};

// C. Reserve: Decrement Stock (Atomic Check)
const decrementStock = async ({ productId, warehouseId, quantity }, client) => {
  const result = await client.query(
    `
    UPDATE inventory_stock
    SET available_quantity = available_quantity - $3,
        updated_at = NOW()
    WHERE product_id = $1 
      AND warehouse_id = $2 
      AND available_quantity >= $3
    RETURNING *
    `,
    [productId, warehouseId, quantity]
  );
  return result.rows[0]; // If null, race condition occurred (stock stolen)
};

// D. Create the Reservation Record
const createReservation = async ({ orderId, productId, warehouseId, quantity, expiresAt }, client) => {
  await client.query(
    `
    INSERT INTO inventory_reservations 
      (order_id, product_id, warehouse_id, quantity, status, expires_at)
    VALUES ($1, $2, $3, $4, 'RESERVED', $5)
    `,
    [orderId, productId, warehouseId, quantity, expiresAt]
  );
};
// [NEW] Check generic existence for idempotency (Any warehouse)
const getReservationExact = async (orderId, productId, warehouseId) => {
  const result = await db.query(
    `SELECT * FROM inventory_reservations 
     WHERE order_id = $1 
       AND product_id = $2 
       AND warehouse_id = $3`,
    [orderId, productId, warehouseId]
  );
  return result.rows[0] || null;
};



// Increase stock (Reverse of decrement)
const incrementStock = async ({ productId, warehouseId, quantity }, client) => {
  await client.query(
    `
    UPDATE inventory_stock
    SET available_quantity = available_quantity + $3,
        updated_at = NOW()
    WHERE product_id = $1 AND warehouse_id = $2
    `,
    [productId, warehouseId, quantity]
  );
};

// Update reservation status
const updateReservationStatus = async (reservationId, status, client) => {
  await client.query(
    `UPDATE inventory_reservations SET status = $2, updated_at = NOW() WHERE id = $1`,
    [reservationId, status]
  );
};

// 1. Try to Claim the Order (Step 1)
// Returns the row if inserted, or null if it already existed
const claimOrder = async (orderId, client) => {
  // Note: We use the client if passed (transaction), or db pool if not
  const dbClient = client || db; 
  
  const result = await dbClient.query(
    `INSERT INTO inventory_orders (order_id, status)
     VALUES ($1, 'PROCESSING')
     ON CONFLICT (order_id) DO NOTHING
     RETURNING *`,
    [orderId]
  );
  return result.rows[0];
};

// 2. Check existing order status (For idempotency checks)
const getInventoryOrderStatus = async (orderId) => {
  const result = await db.query(
    `SELECT status FROM inventory_orders WHERE order_id = $1`,
    [orderId]
  );
  return result.rows[0];
};

// 3. Update Status (Step 3: Mark Reserved or Failed)
const updateOrderStatus = async (orderId, status, client) => {
  await client.query(
    `UPDATE inventory_orders 
     SET status = $2, updated_at = NOW() 
     WHERE order_id = $1`,
    [orderId, status]
  );
};

module.exports = {
  createProduct,
  getProductById,
  setStock,
  adjustStockIncrement,
  getStockLevel,
  getGlobalStockLevel,
  getStockBreakdown,
  getReservationsByOrderId,
  createOutboxEntry,
  findAndLockBestWarehouse,
  decrementStock,
  createReservation,
  getReservationExact,
  incrementStock,
  updateReservationStatus,
   claimOrder,
  getInventoryOrderStatus,
  updateOrderStatus

};