const db = require("../index");

/**
 * Create a new order
 */
const createOrder = async (order, client = db) => {
  const { id, userId, items, totalAmount, status, idempotencyKey } = order;

  await client.query(
    `INSERT INTO orders (id, user_id, items, total_amount, status, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, JSON.stringify(items), totalAmount, status, idempotencyKey]
  );
};

/**
 * Create an Outbox Entry
 */
const createOutboxEntry = async (entry, client = db) => {
  const { aggregate_type, aggregate_id, event_type, payload, metadata } = entry;
  
  // PostgreSQL 'pg' driver will handle objects for JSONB columns automatically
  const result = await client.query(
    `INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload, metadata, traceparent, tracestate)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [aggregate_type, aggregate_id, event_type, payload, metadata, entry.traceparent, entry.tracestate]
  )
  return result.rows[0];;
};

/**
 * Get order by ID
 */
const getOrderById = async (orderId) => {
  const result = await db.query(
    `
    SELECT *
    FROM orders
    WHERE id = $1
    `,
    [orderId]
  );

  return result.rows[0] || null;
};

/**
 * Get all orders for a user
 */
const getOrdersByUserId = async (userId) => {
  const result = await db.query(
    `
    SELECT *
    FROM orders
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
    [userId]
  );

  return result.rows;
};
const getOrderByIdempotencyKey = async (key) => {
  const result = await db.query(
    `SELECT * FROM orders WHERE idempotency_key = $1`,
    [key]
  );
  return result.rows[0] || null;
};

const updateOrderStatus = async(orderId, status)=> {
  await db.query(
    `
    UPDATE orders
    set status = $1
    where id = $2
    `,
    [status, orderId]
  )
}

const getOrderForUpdate = async(orderId, client) =>{
  const res = await client.query(`
    SELECT * FROM orders where id = $1 FOR UPDATE`,
    [orderId]
    )
     return res.rows[0];
}

const markCancelled = async (orderId, key, client = db) => {
  await client.query(
    `
    UPDATE orders
    SET status = 'CANCELLED',
        cancelled_at = NOW(),
        cancel_idempotency_key = $2
    WHERE id = $1
    `,
    [orderId, key]
  );
};

const markCancelRequested = async (orderId, key, client) => {
  await client.query(
    `
    UPDATE orders
    SET status = 'CANCEL_REQUESTED',
        cancel_idempotency_key = $2
    WHERE id = $1
    `,
    [orderId, key]
  );
};

module.exports = {
  createOrder,
  getOrderById,
  getOrdersByUserId,
  getOrderForUpdate,
  getOrderByIdempotencyKey,
  updateOrderStatus,
  createOutboxEntry,
  markCancelled,
  markCancelRequested
};
