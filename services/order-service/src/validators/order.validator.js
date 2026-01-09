const Joi = require("joi");

// --- REUSABLE FRAGMENTS ---
const uuid = Joi.string().uuid();
const positiveInt = Joi.number().integer().min(1);
const positiveAmount = Joi.number().positive();

/**
 * 1. Create Order validation (Request Body)
 */
const createOrderSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        productId: uuid.required(),
        quantity: positiveInt.required()
      })
    )
    .min(1)
    .required(),

  totalAmount: positiveAmount.required()
});

/**
 * 2. Order ID param validation (URL Params)
 */
const orderIdParamSchema = Joi.object({
  id: uuid.required()
});

/**
 * 3. Idempotency Header validation (Request Headers)
 */
const cancelOrderSchema = Joi.object({
  // Express automagically lowercases headers
  "idempotency-key": uuid.required()
}).unknown(true); 

// --- EXPORTS ---
module.exports = {
  createOrderSchema,
  orderIdParamSchema,
  cancelOrderSchema // Added missing export
};