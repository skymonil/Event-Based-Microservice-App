const Joi = require("joi");

/**
 * Create Order validation
 */
const createOrderSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        productId: Joi.string().uuid().required(),
        quantity: Joi.number().integer().min(1).required()
      })
    )
    .min(1)
    .required(),

  totalAmount: Joi.number().positive().required()
});

/**
 * Order ID param validation
 */
const orderIdParamSchema = Joi.object({
  id: Joi.string().uuid().required()
});

module.exports = {
  createOrderSchema,
  orderIdParamSchema
};
