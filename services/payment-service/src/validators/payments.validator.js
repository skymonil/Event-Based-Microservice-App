const Joi = require("joi");

/**
 * Validate params for:
 * GET /payments/order/:orderId
 */
const getPaymentsByOrderSchema = Joi.object({
  orderId: Joi.string()
    .uuid()
    .required()
    .messages({
      "string.guid": "orderId must be a valid UUID",
      "any.required": "orderId is required"
    })
});

/**
 * (Optional, future use)
 * Validate payment events consumed from Kafka
 * Useful for defensive programming
 */
const paymentEventSchema = Joi.object({
  orderId: Joi.string().uuid().required(),
  userId: Joi.string().uuid().required(),
  paymentId: Joi.string().uuid().optional(),
  amount: Joi.number().positive().required(),
  status: Joi.string()
    .valid("SUCCESS", "FAILED", "COMPLETED")
    .required()
});

module.exports = {
  getPaymentsByOrderSchema,
  paymentEventSchema
};
