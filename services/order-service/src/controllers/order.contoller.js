const { getRequestLogger } = require("../utils/logger");
const orderService = require("../services/order.service");
const {logger} = require('../utils/logger')
/**
 * Create a new order
 */
const createOrder = async (req, res, next) => {
  const logger = getRequestLogger(req.requestId);
  const idempotencyKey = req.headers["idempotency-key"];

  try {
    const userId = req.user.userId;
    const { items, totalAmount } = req.body;

    logger.info(
      { userId, idempotencyKey },
      "Create order request received"
    );

    const order = await orderService.createOrder({
      userId,
      items,
      totalAmount,
      idempotencyKey,
      requestId: req.requestId
    });

    // Idempotent replay → OK
     if (order.isDuplicate) {
      logger.info({ orderId: order.id }, "Duplicate order detected");
      return res.status(200).json(order);
    }

    // Fresh creation → Created
    logger.info({ orderId: order.id }, "Order and Outbox event persisted");
    return res.status(201).json(order);

  } catch (error) {
    logger.error(error, "Create order failed");
    next(error); // Error middleware will handle RFC 7807 formatting
  }
};

/**
 * Get order by ID
 */
const getOrderById = async (req, res, next) => {
  const logger = getRequestLogger(req.requestId);

  try {
    const { id } = req.params;
    const userId = req.user.userId;

    logger.info({ orderId: id }, "Fetch order request");

    const order = await orderService.getOrderById(id, userId);

    // Service guarantees either:
    // - valid order
    // - RFC 7807 AppError thrown
    return res.status(200).json(order);
  } catch (error) {
    logger.error(error, "Fetch order failed");
    next(error);
  }
};

/**
 * Get orders for logged-in user
 */
const getOrdersForUser = async (req, res, next) => {
  const logger = getRequestLogger(req.requestId);

  try {
    const userId = req.user.userId;

    logger.info({ userId }, "Fetch user orders");

    const orders = await orderService.getOrdersForUser(userId);

    return res.status(200).json(orders);
  } catch (error) {
    logger.error(error, "Fetch user orders failed");
    next(error);
  }
};

module.exports = {
  createOrder,
  getOrderById,
  getOrdersForUser
};
