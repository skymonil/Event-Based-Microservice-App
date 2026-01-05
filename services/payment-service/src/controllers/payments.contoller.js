// src/controllers/user.controller.js
const logger = require("../utils/logger");
const { getRequestLogger } = require("../utils/logger");
const paymentService = require('../services/payments.service')

// Get Payments for a specific order

const getPaymentsByOrder = async(req , res , next)=>{
  try {
    const {orderId} = req.params;
    const userId = req.user.userId;

    logger.info({orderId, userId}, "Fetch Payments for order")
    
    const payments = await paymentService.getPaymentsByOrder(
      orderId,
      userId
    )

    return res.status(200).json(payments)
  } catch (error) {
    logger.error(error, "Fetch payments by order failed");
    next(error);

  }
}


// Get all payments for logged-in user
const getPaymentsForUser = async(req , res , next)=>{
  const logger = getRequestLogger(req.requestId);

  try {
    const userId = req.user.userId;
    logger.info(
      { userId },
      "Fetch payments for user"
    );

    const payments = await paymentService.getPaymentsForUser(userId);
    return res.status(200).json(payments);
  } catch (error) {
     logger.error(error, "Fetch payments for user failed");
    next(error);
  }
}
module.exports = {
  getPaymentsByOrder,
  getPaymentsForUser
};
