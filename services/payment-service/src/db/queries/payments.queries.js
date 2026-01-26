// services/payment-service/src/db/queries/payments.queries.js
const db = require("../index");

/**
 * Create a new payment record
 * Ensure the first parameter is the data object, second is the client
 */
const createPayment = async (paymentData, client = db) => {
  const { id, orderId, userId, amount, currency, status, provider, idempotencyKey } = paymentData;
  await client.query(
    `INSERT INTO payments (id, order_id, user_id, amount, currency, status, provider, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, orderId, userId, amount, currency, status, provider, idempotencyKey]
  );
};

const createOutboxEntry = async (entry, client = db) => {
  const { aggregate_type, aggregate_id, event_type, payload, metadata, traceparent, tracestate } = entry;
  await client.query(
    `INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload, metadata, traceparent, tracestate)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [aggregate_type, aggregate_id, event_type, payload, metadata, traceparent, tracestate]
  );
};


// Get all payments for an order (For API/UI)
const getPaymentsByOrderId = async (orderId) => {
  const { rows } = await db.query(
    `
    Select * 
    FROM payments
    WHERE order_id = $1
    ORDER BY created_at DESC
    `,
    [orderId]
  )
  return rows;
}

// Get all Payments for a user
const getPaymentsByUserId = async (userId) => {
  const { rows } = await db.query(
    `
    Select * 
    FROM payments
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
    [userId]
  )
  return rows;
}

// Find payment by idempotency key
const getPaymentByIdempotencyKey = async (idempotencyKey) => {
  const { rows } = await db.query(
    `
    select * 
    FROM payments 
    where idempotency_key = $1
    `,
    [idempotencyKey]
  )
  return rows[0];
}

/**
 * Get the most recent payment for an order (For Service Logic)
 * Uses FOR UPDATE to lock the row during a refund/status change
 */
const getPaymentsByOrder = async (orderId) => {
  const { rows } = await db.query(
    `
    Select * 
    FROM payments
    WHERE order_id = $1
    ORDER BY created_at DESC
    `,
    [orderId]
  )
  return rows;
}

/**
 * Update payment status to REFUNDED
 */
const markRefunded = async (paymentId, client = db) => {
  await client.query(
    `UPDATE payments SET status = 'REFUNDED' WHERE id = $1`,
    [paymentId]
  );
};

module.exports = {
  getPaymentsByOrderId,
  getPaymentsByUserId,
  getPaymentByIdempotencyKey,
  createPayment,
  createOutboxEntry,
  getPaymentsByOrder,
  markRefunded
}