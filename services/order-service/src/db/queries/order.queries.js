const db = require("../index");

/**
 * Create a new order
 */
const createOrder = async (order) => {
  const { id, userId, items, totalAmount, status, idempotencyKey  } = order;

  await db.query(
    `
    INSERT INTO orders (id, user_id, items, total_amount, status, idempotency_key)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [id, userId, items, totalAmount, status,idempotencyKey ]
  );
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

module.exports = {
  createOrder,
  getOrderById,
  getOrdersByUserId,
  getOrderByIdempotencyKey,
  updateOrderStatus
};
