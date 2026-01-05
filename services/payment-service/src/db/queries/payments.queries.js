const db = require("../index");

// Create a new payment record

const createPayment = async ({
  id,
  orderId,
  userId,
  amount,
  currency,
  status,
  provider,
  idempotencyKey
}) => {
  await db.query(
    `
    INSERT INTO payments (
      id,
      order_id,
      user_id,
      amount,
      currency,
      status,
      provider,
      idempotency_key
    )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,[
        id,
      orderId,
      userId,
      amount,
      currency,
      status,
      provider,
      idempotencyKey
    ]
  )
}

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
  createPayment
}