const { v4: uuidv4 } = require("uuid");
const paymentQueries = require("../db/queries/payments.queries");
const AppError = require("../utils/app-error");
const db = require('../db')
// Get Payments for an ordeer

const getPaymentsByOrder = async(orderId, userId) => {
    const payments = await paymentQueries.getPyamentsByOrderId(orderId)

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
const processPayment = async({
orderId,
userId,
amount,
currency = "INR",
idempotencyKey,
traceHeaders = {}
}) =>{
 //1. Idempotency Check

 if(idempotencyKey){
    const existing = await paymentQueries.getPaymentByIdempotencyKey(idempotencyKey)
 

  if (existing) {
      return {
        id: existing.id,
        orderId: existing.order_id,
        status: existing.status,
        isDuplicate: true
      };
    }
}


 //2.  Mock payment provider
const paymentSucceeded = Math.random() < 0.8;
const paymentStatus = paymentSucceeded ? "SUCCESS" : "FAILED";
const eventType = paymentSucceeded ? "payment.completed" : "payment.failed";

const paymentId = uuidv4();
const paymentData = {
    id: paymentId,
    orderId,
    userId,
    amount,
    currency,
    status: paymentStatus,
    provider: "MOCK",
    idempotencyKey
}

// 3. TRANSACTIONAL OUTBOX PATTERN
const client = await db.connect()

try {
  await client.query('BEGIN');

  //Step A: Create The Payment Record
  await paymentQueries.createPayment(paymentData,client)

  //Step B: Create The OutBox Entry For Debezium

  const outboxEntry = {
    aggregate_type: 'PAYMENT',
      aggregate_id: paymentId,
      event_type: eventType, // This determines the Kafka Topic
      payload: {
        paymentId,
        orderId,
        status: paymentStatus,
        reason: paymentSucceeded ? null : "Insufficient funds (MOCK)"
      },
      metadata: { ...traceHeaders } // Propagate tracing forward
  }

  await paymentQueries.createOutboxEntry(outboxEntry, client);

   await client.query('COMMIT');

   logger.info({ paymentId, orderId, paymentStatus }, "Payment processed and Outbox event saved");

     return {
      id: paymentId,
      orderId,
      status: paymentStatus,
      isDuplicate: false
    };
} catch (err) {
  if (client) await client.query('ROLLBACK');
    logger.error({ err, orderId }, "Payment processing transaction failed");
    throw err;
}
finally {
    client.release();
  }
}
module.exports = {
  getPaymentsByOrder,
  getPaymentsForUser,
  processPayment
};
