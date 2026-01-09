const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const {
  createOrderSchema,
  orderIdParamSchema,
  cancelOrderSchema
} = require("../validators/order.validator");

const {
  createOrder,
  getOrderById,
  getOrdersForUser,
  cancelOrder
} = require("../controllers/order.contoller");

// Create order
router.post(
  "/orders",
  authenticate,
  validate(createOrderSchema),
  createOrder
);

// Get order by ID
router.get(
  "/orders/:id",
  authenticate,
  validate(orderIdParamSchema, "params"),
  getOrderById
);

// Get orders for logged-in user
router.get(
  "/orders",
  authenticate,
  getOrdersForUser
);

router.post(
  "/orders/cancel/:id",
  authenticate,
  // 1. Validate the URL parameter (:id)
  validate(orderIdParamSchema, "params"), 
  // 2. Validate the Idempotency Header
  validate(cancelOrderSchema, "headers"), 
  cancelOrder
);

module.exports = router;
