const { v4: uuidv4 } = require("uuid");
const orderQueries = require("../db/queries/order.queries");
const { publishOrderCreated } = require("../kafka/producer");
const AppError = require("../utils/app-error");

/**
 * Create a new order
 */
const createOrder = async ({
  userId,
  items,
  totalAmount,
  idempotencyKey,
  requestId
}) => {
  // 🔁 Idempotency check
  if (idempotencyKey) {
    const existing =
      await orderQueries.getOrderByIdempotencyKey(idempotencyKey);

    if (existing) {
      return {
        id: existing.id,
        userId: existing.user_id,
        totalAmount: existing.total_amount,
        status: existing.status,
        idempotencyKey: existing.idempotency_key,
        isDuplicate: true
      };
    }
  }

  const order = {
    id: uuidv4(),
    userId,
    items: JSON.stringify(items),
    totalAmount,
    status: "CREATED",
    idempotencyKey
  };

  // Persist first (source of truth)
  await orderQueries.createOrder(order);

  // Publish domain event
  try {
    await publishOrderCreated({
      orderId: order.id,
      userId,
      totalAmount,
      createdAt: new Date().toISOString(),
      requestId,
      idempotencyKey
    });
  } catch (err) {
    // Infrastructure failure → RFC 7807
    throw new AppError({
      type: "https://order-service/problems/event-publish-failed",
      title: "Event Publish Failed",
      status: 500,
      detail: "Order was created but event publication failed"
    });
  }

  return {
    id: order.id,
    userId: order.userId,
    totalAmount: order.totalAmount,
    status: order.status,
    isDuplicate: false
  };
};

/**
 * Get order by ID (ownership enforced)
 */
const getOrderById = async (orderId, userId) => {
  const order = await orderQueries.getOrderById(orderId);

  if (!order) {
    throw new AppError({
      type: "https://order-service/problems/order-not-found",
      title: "Not Found",
      status: 404,
      detail: "Order not found"
    });
  }

  if (order.user_id !== userId) {
    throw new AppError({
      type: "https://order-service/problems/forbidden",
      title: "Forbidden",
      status: 403,
      detail: "You are not allowed to access this order"
    });
  }

  return {
    id: order.id,
    userId: order.user_id,
    items: order.items,
    totalAmount: order.total_amount,
    status: order.status,
    createdAt: order.created_at
  };
};

/**
 * Get all orders for a user
 */
const getOrdersForUser = async (userId) => {
  const orders = await orderQueries.getOrdersByUserId(userId);

  return orders.map((order) => ({
    id: order.id,
    totalAmount: order.total_amount,
    status: order.status,
    createdAt: order.created_at
  }));
};

module.exports = {
  createOrder,
  getOrderById,
  getOrdersForUser
};
