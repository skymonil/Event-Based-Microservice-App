const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const {
  createOrderSchema,
  orderIdParamSchema
} = require("../validators/order.validator");

const {
  createOrder,
  getOrderById,
  getOrdersForUser
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

module.exports = router;
