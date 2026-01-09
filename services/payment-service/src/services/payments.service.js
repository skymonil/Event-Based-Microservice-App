const { v4: uuidv4 } = require("uuid");
const paymentQueries = require("../db/queries/payments.queries");
const AppError = require("../utils/app-error");
const db = require('../db');
const {logger} = require("../utils/logger");

const getPaymentsByOrder = async(orderId, userId) => {
    const payments = await paymentQueries.getPaymentsByOrderId(orderId)

    if(!payments.length){
         throw new AppError({
      type: "https://payment-service/problems/payments-not-found",
      title: "Not Found",
      status: 404,
      detail: "No payments found for this order"
    });
    }

    if(payments[0].user_id !== userId){
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
}


// Get all payments for a user
const getPaymentsForUser = async(userId) => {
    const payments = await paymentQueries.getPaymentsByUserId(userId)

    if(!payments.length){
        throw new AppError({
      type: "https://payment-service/problems/payments-not-found",
      title: "Not Found",
      status: 404,
      detail: "No payments found for this user"
    });}

if(payments[0].user_id !== userId){
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
    }))
}

// Process payment for an order (called by Kafka consumer)
const processPayment = async ({ orderId, userId, amount, currency = "INR", traceHeaders = {} }) => {
  const logContext = { orderId, userId, amount }; // Standard context for every log in this function

  // 1️⃣ Idempotency: Check if array has content
  const existingRows = await paymentQueries.getPaymentsByOrderId(orderId);
  if (existingRows && existingRows.length > 0) {
    const existing = existingRows[0];
    logger.info(
      { ...logContext, paymentId: existing.id, status: existing.status },
      "Idempotency check: Payment already processed for this order"
    );
    return { id: existing.id, orderId, status: existing.status, isDuplicate: true };
  }

  // 2️⃣ Deterministic Decision
  logger.debug({ orderId }, "Determining mock payment outcome...");
  const paymentSucceeded = parseInt(orderId.replace(/-/g, "").slice(0, 2), 16) % 2 === 0;
  const paymentStatus = paymentSucceeded ? "SUCCESS" : "FAILED";
  const eventType = paymentSucceeded ? "payment.completed" : "payment.failed";
  const paymentId = uuidv4();

  const client = await db.connect();

  try {
    logger.info(
      { ...logContext, paymentId, paymentStatus, eventType },
      `Initiating payment transaction: Result will be ${paymentStatus}`
    );

    await client.query("BEGIN");

    await paymentQueries.createPayment({
      id: paymentId,
      orderId,
      userId,
      amount,
      currency,
      status: paymentStatus,
      provider: "MOCK"
    }, client);

    await paymentQueries.createOutboxEntry({
      aggregate_type: "PAYMENT",
      aggregate_id: orderId,
      event_type: eventType,
      payload: { paymentId, orderId, userId, amount, status: paymentStatus },
      metadata: traceHeaders // 🛰️ This carries your OpenTelemetry Trace ID!
    }, client);

    await client.query("COMMIT");
    
    logger.info({ orderId, paymentId, paymentStatus }, "Payment transaction committed successfully");

    return { id: paymentId, orderId, status: paymentStatus, isDuplicate: false };

  } catch (err) {
    if (client) await client.query("ROLLBACK");

    // 🛡️ Handle Race Condition: Unique Violation (order_id constraint)
    if (err.code === '23505') {
      logger.warn(
        { ...logContext, errorCode: err.code }, 
        "Race condition detected: Unique constraint violation on order_id. Concurrent transaction likely succeeded."
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

    const payment = await paymentQueries.getPaymentsByOrder(orderId, client);

    if (!payment || payment.status !== "SUCCESS") {
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

  } catch (err) {
    await client.query("ROLLBACK");
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
