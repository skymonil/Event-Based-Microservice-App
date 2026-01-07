const { v4: uuidv4 } = require("uuid");
const orderQueries = require("../db/queries/order.queries");
const { prepareOrderCreatedEvent } = require("../kafka/producer");
const AppError = require("../utils/app-error");
const db = require("../db"); // Import the DB pool to start transactions
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
        ...existing,
        isDuplicate: true
      };
    }
  }
  const orderId = uuidv4();
  const orderData = {
    id: orderId,
    userId,
    items ,
    totalAmount,
    status: "CREATED",
    idempotencyKey
  };

// 🛡️ TRANSACTIONAL OUTBOX PATTERN
  // We use a single transaction for both the order and outbox 
  const client = await db.connect()
  try{
    await client.query('BEGIN');
    // 1. Persist the Order
    await orderQueries.createOrder(orderData, client);

    // 2. Prepare the Outbox Event (includes OpenTelemetry tracing)
    const outboxEntry = prepareOrderCreatedEvent({
      orderId,
      userId,
      totalAmount,
      items,
      createdAt: new Date().toISOString(),
      requestId,
      idempotencyKey
    })

    // 3. Persist the Event to the Outbox table
    await orderQueries.createOutboxEntry(outboxEntry, client);
    await client.query('COMMIT');

    return {
     id: orderId,
      userId,
      totalAmount,
      status: "CREATED",
      isDuplicate: false
  };
  }
  catch (err) {
    await client.query('ROLLBACK');
    throw err; // Let the controller/middleware handle the error
  } finally {
    client.release();
  }
   


  
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

const handlePaymentCompleted = async(orderId,paymentId) =>{
   logger.info({ orderId, paymentId }, "Handling payment completion");
  await orderQueries.updateOrderStatus(
    orderId,
    "PAID"
  )
}
const handlePaymentFailed = async(orderId,paymentId,reason) =>{
  logger.warn({ orderId, paymentId, reason }, "Handling payment failure");
  await orderQueries.updateOrderStatus(
    orderId,
    "PAYMENT_FAILED"
  )
}

const healthCheck = async () => {
  await orderQueries.ping(); // SELECT 1
};

module.exports = {
  createOrder,
  getOrderById,
  getOrdersForUser,
  handlePaymentCompleted,
  handlePaymentFailed,
  healthCheck
};
