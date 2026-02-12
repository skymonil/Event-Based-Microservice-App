const { v4: uuidv4 } = require("uuid");
const orderQueries = require("../db/queries/order.queries");
const { prepareOrderCreatedEvent } = require("../kafka/producer");
const AppError = require("../utils/app-error");
const db = require("../db"); // Import the DB pool to start transactions
const {logger} = require('../utils/logger');
const {trace, SpanStatusCode, context, propagation} = require("@opentelemetry/api");
const tracer = trace.getTracer("order-service");

// IMPORT METRICS
const { ordersTotal, orderValue } = require("../metrics");

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

    return tracer.startActiveSpan("order.create", async (span) => {
      span.setAttribute("user.id", userId);
    span.setAttribute("order.amount", totalAmount);
  // 🔁 Idempotency check
  if (idempotencyKey) {
    const existing =
      await orderQueries.getOrderByIdempotencyKey(idempotencyKey);

    if (existing) {
      span.end();
      // Metric: Duplicate Request Ignored
      ordersTotal.inc({ status: "DUPLICATE_IGNORED" });
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

    // 📊 Metric: Order Created & Revenue Recorded
      ordersTotal.inc({ status: "CREATED" });
      orderValue.observe(totalAmount);

    return {
     id: orderId,
      userId,
      totalAmount,
      status: "CREATED",
      isDuplicate: false,
      createdAt: new Date().toISOString()
      
  };
  }
  catch (err) {
    await client.query('ROLLBACK');
    throw err; // Let the controller/middleware handle the error
  } finally {
    client.release();
    span.end();
  }
})
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

const cancelOrder = async({orderId, userId, idempotencyKey, traceHeaders = {}}) => {
  return tracer.startActiveSpan("order.cancel", async (span) => {
     span.setAttribute("order.id", orderId);
  const client = await db.connect()
  const logContext = { orderId, userId, idempotencyKey };

  try {
    await client.query("BEGIN");
    
    // 1. Lock the row to prevent race conditions during status changes
    const order = await orderQueries.getOrderForUpdate(orderId, client);

    if(!order) {
      logger.warn(logContext, "Cancellation failed: Order not found");
      throw new AppError({status: 404, detail: "Order not found"})}

    if(order.user_id !== userId){
       logger.error(logContext, "Security Alert: User attempted to cancel an order they do not own");
       throw new AppError({ status: 403, detail: "Forbidden" });}

     // 🔁 Idempotency
    if (order.cancel_idempotency_key === idempotencyKey) {
      await client.query("COMMIT");
       logger.info(logContext, "Idempotent cancellation request handled");
      return { orderId, status: order.status, duplicate: true };
    }

    // ⏱ Cancellation window check
    if (new Date() > order.cancellable_until) {
      logger.warn({ ...logContext, cancellableUntil: order.cancellable_until }, "Cancellation rejected: Window expired");
      throw new AppError({ status: 409, detail: "Cancellation window expired" });
    }

    let finalStatus;
    let eventType;

     if (order.status === "CREATED" || order.status == "PAYMENT_FAILED") {

      finalStatus = "CANCELLED";
      eventType = "order.cancelled"
      await orderQueries.markCancelled(orderId, idempotencyKey, client);

      // 📊 Metric: User Cancelled
        ordersTotal.inc({ status: "CANCELLED", reason: "USER_REQUEST" });
      logger.info(logContext, `Order state ${order.status} -> CANCELLED (No refund needed)`);
     }
    else if (order.status === "PAID") {

       /**
       * CASE: User paid. 
       * We move to CANCELLING and trigger the Refund Saga.
       */
      finalStatus = "CANCELLING"; // Better than CANCEL_REQUESTED for state clarity
      eventType = "order.cancel.requested";

      await orderQueries.markCancelRequested(orderId, idempotencyKey, client);
      // 📊 Metric: Refund Process Started
        ordersTotal.inc({ status: "REFUND_REQUESTED", reason: "USER_REQUEST" });
      logger.info(logContext, "Order state PAID -> CANCELLING (Refund Saga triggered)");

    }
     else {
      logger.warn({ ...logContext, currentStatus: order.status }, "Cancellation rejected: Invalid state");
      throw new AppError({
        status: 409,
        detail: `Cannot cancel order in state ${order.status}`
      });
    }

    await orderQueries.createOutboxEntry({
      aggregate_type: "ORDER",
      aggregate_id: orderId,
      event_type: eventType,
     traceparent: traceHeaders.traceparent, 
      tracestate: traceHeaders.tracestate,
      payload: { orderId, userId,reason: "USER_CANCELLED" ,originalStatus: order.status },
      metadata: { ...traceHeaders, "idempotency-key": idempotencyKey }
    }, client);

   await client.query("COMMIT");
 return { orderId, status: finalStatus, duplicate: false };

  } catch (err) {
     await client.query("ROLLBACK");
    throw err;
  } finally{
    client.release()
  }
})
}
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
   return tracer.startActiveSpan("order.handlePaymentCompleted", async (span) => {
     span.setAttribute("order.id", orderId);
    span.setAttribute("payment.id", paymentId);
   logger.info({ orderId, paymentId }, "Handling payment completion");
   try {
     await orderQueries.updateOrderStatus(
    orderId,
    "PAID"
  )
   // 📊 Metric: Successful Payment

   ordersTotal.inc({ status: "PAID" });
   span.setStatus({ code: SpanStatusCode.OK });
   } catch (err) {
     span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
   }finally{
      span.end();
   }
 })
}

const handlePaymentFailed = async(orderId,paymentId,reason) =>{
  logger.warn({ orderId, paymentId, reason }, "Handling payment failure");

  return tracer.startActiveSpan("order.handlePaymentFailed", async (span) => {
    span.setAttribute("order.id", orderId);
    span.setAttribute("payment.id", paymentId);
    try {
  await orderQueries.updateOrderStatus(
    orderId,
    "PAYMENT_FAILED"
  )

  // 📊 Metric: Payment Failure -> Auto Cancel
      ordersTotal.inc({ status: "CANCELLED", reason: "PAYMENT_FAILED" });

  span.setStatus({ code: SpanStatusCode.OK });
}
catch (err) {
      span.recordException(err);
span.setStatus({
code: SpanStatusCode.ERROR,
message: err.message})
   }finally{
      span.end();
   }})
  }

const healthCheck = async () => {
  await orderQueries.ping(); // SELECT 1
};

const handlePaymentRefunded = async({orderId, traceHeaders}) =>{
  const client = await db.connect();
  try {
    
    const order = await orderQueries.getOrderForUpdate(orderId, client);
    if(!order) {
      logger.warn({ orderId }, "Refund handling failed: Order not found");
      throw new AppError({status: 404, detail: "Order not found"})}
    
    
    await client.query("BEGIN")

    // 1. Update Order Status to final CANCELLED
    await orderQueries.markCancelled(orderId, order.cancel_idempotency_key, client);
    // 2. Insert into Outbox (so other services know it's fully done)
    await orderQueries.createOutboxEntry({
      aggregate_type: "ORDER",
      aggregate_id: orderId,
      event_type: "order.refunded",
       traceparent: traceHeaders.traceparent,
      tracestate: traceHeaders.tracestate, 
      payload: { orderId, status: "CANCELLED" },
      metadata: traceHeaders
    }, client);
    
    await client.query("COMMIT");
     ordersTotal.inc({ status: "REFUND_COMPLETED" });
    logger.info({ orderId }, "Order successfully marked as REFUNDED/CANCELLED");
  } catch (err) {
     await client.query("ROLLBACK");
    throw err;
  }finally{
    client.release()
  }
}

module.exports = {
  createOrder,
  getOrderById,
  getOrdersForUser,
  handlePaymentCompleted,
  handlePaymentFailed,
  healthCheck,
  handlePaymentRefunded,
  cancelOrder
};
