const { v4: uuidv4 } = require("uuid");
const paymentQueries = require("../db/queries/payments.queries");
const AppError = require("../utils/app-error");

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
idempotencyKey
}) =>{
 // Idempotency Check

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


 //  Mock payment provider
const paymentSucceeded = Math.random() < 0.8;

const payment = {
    id: uuidv4(),
    orderId,
    userId,
    amount,
    currency,
    status: paymentSucceeded ? "SUCCESS" : "FAILED",
    provider: "MOCK",
    idempotencyKey
}
await paymentQueries.createPayment(payment);
  return {
    id: payment.id,
    orderId: payment.orderId,
    status: payment.status,
    isDuplicate: false
  };
}
module.exports = {
  getPaymentsByOrder,
  getPaymentsForUser,
  processPayment
};
