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
  const { aggregate_type, aggregate_id, event_type, payload, metadata } = entry;
  await client.query(
    `INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [aggregate_type, aggregate_id, event_type, payload, metadata]
  );
};


// Get payments by order ID
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

// Get Payments for a user
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

module.exports = {
  getPaymentsByOrderId,
  getPaymentsByUserId,
  getPaymentByIdempotencyKey,
  createPayment,
  createOutboxEntry
}