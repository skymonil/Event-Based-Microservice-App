const express = require("express");
const router = express.Router();

const {authMiddleware } = require("@my-app/common");
const validate = require("../middleware/validate.middleware");
const {
	createOrderSchema,
	orderIdParamSchema,
	cancelOrderSchema,
} = require("../validators/order.validator");

const {
	createOrder,
	getOrderById,
	getOrdersForUser,
	cancelOrder,
} = require("../controllers/order.contoller");

// Create order
router.post("/orders", authMiddleware, validate(createOrderSchema), createOrder);

// Get order by ID
router.get(
	"/orders/:id",
	authMiddleware,
	validate(orderIdParamSchema, "params"),
	getOrderById,
);

// Get orders for logged-in user
router.get("/orders", authMiddleware, getOrdersForUser);

router.post(
	"/orders/cancel/:id",
	authMiddleware,
	// 1. Validate the URL parameter (:id)
	validate(orderIdParamSchema, "params"),
	// 2. Validate the Idempotency Header
	validate(cancelOrderSchema, "headers"),
	cancelOrder,
);

module.exports = router;
