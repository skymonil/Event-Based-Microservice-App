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
} = require("../controllers/order.controller");

// Create order
router.post("/create", authMiddleware, validate(createOrderSchema), createOrder);

// Get order by ID
router.get(
	"/:id",
	authMiddleware,
	validate(orderIdParamSchema, "params"),
	getOrderById,
);

// Get orders for logged-in user
router.get("/list", authMiddleware, getOrdersForUser);

router.post(
	"/cancel/:id",
	authMiddleware,
	// 1. Validate the URL parameter (:id)
	validate(orderIdParamSchema, "params"),
	// 2. Validate the Idempotency Header
	validate(cancelOrderSchema, "headers"),
	cancelOrder,
);

module.exports = router;
