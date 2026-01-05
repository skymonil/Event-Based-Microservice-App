// src/routes/user.routes.js
const express = require("express");
const router = express.Router();
const authenticate = require('../middleware/auth.middleware')
const validate = require('../middleware/validate.middleware'); 


const {
    getPaymentsByOrderSchema
} = require('../validators/payments.validator')

const {
    getPaymentsByOrder,
    getPaymentsForUser
} = require('../controllers/payments.contoller')

// Get payments for a specific user
router.get(
    '/payments/order/:orderId',
    authenticate,
    validate(getPaymentsByOrderSchema, "params"),
    getPaymentsByOrder)

//Get all payments for a Logged-in User

router.get(
    "/payments",
    authenticate,
    getPaymentsForUser
)
module.exports = router;
