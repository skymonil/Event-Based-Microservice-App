// src/routes/user.routes.js
const express = require("express");
const router = express.Router();
const {authMiddleware} = require("@my-app/common");
const validate = require("../middleware/validate.middleware");

const {
	getPaymentsByOrderSchema,
} = require("../validators/payments.validator");

const {
	getPaymentsByOrder,
	getPaymentsForUser,
} = require("../controllers/payments.contoller");
const { auth } = require("../config/config");

// Get payments for a specific order
router.get(
	"/payments/order/:orderId",
	authMiddleware,
	validate(getPaymentsByOrderSchema, "params"),
	getPaymentsByOrder,
);

//Get all payments for a Logged-in User

router.get("/payments", authMiddleware, getPaymentsForUser);
module.exports = router;
