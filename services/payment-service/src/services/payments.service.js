// services/payment-service/src/services/payments.service.js
const { v4: uuidv4 } = require("uuid");
const paymentQueries = require("../db/queries/payments.queries");
const AppError = require("../utils/app-error");
const db = require('../db');
const { logger } = require("../utils/logger");

const getPaymentsByOrder = async (orderId, userId) => {
  const payments = await paymentQueries.getPaymentsByOrderId(orderId);

  // FIX 1: Corrected logic flow. 
  // Previously, you logged info if empty, but then immediately tried to access payments[0], which would crash.
  if (!payments || !payments.length) {
    logger.info(
      { orderId, userId },
      "No payments found for order — likely cancelled or payment not required"
    );
    return []; // Return empty array instead of proceeding to crash
  }

  // FIX 2: Security check. 
  // payments[0] is safe now because of the length check above.
  if (payments[0].user_id !== userId) {
    throw new AppError({
      type: "https://payment-service/problems/forbidden",
      title: "Forbidden",
      status: 403,
      detail: "You are not allowed to access these payments"
    });
  }

  return payments.map((p) => ({
    id: p.id,
    orderId: p.order_id,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    provider: p.provider,
    createdAt: p.created_at
  }));
};

const getPaymentsForUser = async (userId) => {
  const payments = await paymentQueries.getPaymentsByUserId(userId);

  if (!payments || !payments.length) {
    throw new AppError({
      type: "https://payment-service/problems/payments-not-found",
      title: "Not Found",
      status: 404,
      detail: "No payments found for this user"
    });
  }

  // Security check (Note: usually redundant if query filters by userId, but safe to keep)
  if (payments[0].user_id !== userId) {
    throw new AppError({
      type: "https://payment-service/problems/forbidden",
      title: "Forbidden",
      status: 403,
      detail: "You are not allowed to access these payments"
    });
  }

  return payments.map((p) => ({
    id: p.id,
    orderId: p.order_id,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    provider: p.provider,
    createdAt: p.created_at
  }));
};

const processPayment = async ({ orderId, userId, totalAmount, currency = "INR", traceHeaders = {} }) => {
  const logContext = { orderId, userId, totalAmount, traceHeaders };

  const existingRows = await paymentQueries.getPaymentsByOrderId(orderId);
  if (existingRows && existingRows.length > 0) {
    const existing = existingRows[0];
    logger.info(
      { ...logContext, paymentId: existing.id, status: existing.status },
      "Idempotency check: Payment already processed for this order"
    );
    return { id: existing.id, orderId, status: existing.status, isDuplicate: true };
  }

  logger.debug({ orderId }, "Determining mock payment outcome...");
  const paymentSucceeded = parseInt(orderId.replace(/-/g, "").slice(0, 2), 16) % 2 === 0;
  const paymentStatus = paymentSucceeded ? "SUCCESS" : "FAILED";
  const eventType = paymentSucceeded ? "payment.completed" : "payment.failed";
  const paymentId = uuidv4();

  const client = await db.connect();

  try {
    logger.info(
      { ...logContext, paymentId, paymentStatus, eventType, ...traceHeaders },
      `Initiating payment transaction: Result will be ${paymentStatus}`
    );

    await client.query("BEGIN");

    await paymentQueries.createPayment({
      id: paymentId,
      orderId,
      userId,
      amount: totalAmount,
      currency,
      status: paymentStatus,
      provider: "MOCK"
    }, client);

    await paymentQueries.createOutboxEntry({
      aggregate_type: "PAYMENT",
      aggregate_id: orderId,
      event_type: eventType,
      payload: { paymentId, orderId, userId,  totalAmount, status: paymentStatus },
      metadata: traceHeaders
    }, client);

    await client.query("COMMIT");
    logger.info({ orderId, paymentId, paymentStatus }, "Payment transaction committed successfully");

    return { id: paymentId, orderId, status: paymentStatus, isDuplicate: false };

  } catch (err) {
    await client.query("ROLLBACK"); // FIX: await rollback directly

    if (err.code === '23505') {
      logger.warn(
        { ...logContext, errorCode: err.code },
        "Race condition detected: Unique constraint violation on order_id."
      );
      const confirmed = await paymentQueries.getPaymentsByOrderId(orderId);
      return { id: confirmed[0].id, orderId, status: confirmed[0].status, isDuplicate: true };
    }

    logger.error(
      { ...logContext, err: { message: err.message, stack: err.stack } },
      "Failed to process payment transaction"
    );
    throw err;
  } finally {
    client.release();
  }
};

const processRefund = async ({ orderId, userId, traceHeaders }) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    // FIX 3: Changed to getPaymentsByOrderId (Array) and selected [0]
    // because your query logic usually returns an array of rows.
    const payments = await paymentQueries.getPaymentsByOrderId(orderId, client);
    const payment = payments ? payments[0] : null;

    if (!payment || payment.status !== "SUCCESS") {
      logger.info({ orderId }, "Refund skipped: No successful payment found");
      await client.query("ROLLBACK");
      return;
    }

    await paymentQueries.markRefunded(payment.id, client);

    await paymentQueries.createOutboxEntry({
      aggregate_type: "PAYMENT",
      aggregate_id: orderId,
      event_type: "payment.refunded",
      payload: {
        orderId,
        paymentId: payment.id,
        amount: payment.amount
      },
      metadata: traceHeaders
    }, client);

    await client.query("COMMIT");
    logger.info({ orderId, paymentId: payment.id }, "Refund processed successfully");

  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ orderId, err: err.message }, "Failed to process refund");
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  getPaymentsByOrder,
  getPaymentsForUser,
  processPayment,
  processRefund
};