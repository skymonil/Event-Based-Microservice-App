const Joi = require('joi');

const schemas = {
  // Shared building blocks
  productId: Joi.string().uuid().required(),
  warehouseId: Joi.string().uuid().required(),
  orderId: Joi.string().uuid().required(),
  quantity: Joi.number().integer().min(1).required(),

  // The actual request shapes
  adjustStock: Joi.object({
    productId: Joi.string().uuid().required(),
    warehouseId: Joi.string().uuid().required(),
    quantity: Joi.number().integer().required(), // Can be negative for subtractions
    mode: Joi.string().valid('SET', 'ADD').default('ADD')
  }),

  checkAvailability: Joi.object({
    productId: Joi.string().uuid().required(),
    quantity: Joi.number().integer().min(1).default(1)
  }),

  // This schema can be used for the Kafka "order.created" payload too!
  createReservation: Joi.object({
    orderId: Joi.string().uuid().required(),
    productId: Joi.string().uuid().required(),
    warehouseId: Joi.string().uuid().required(),
    quantity: Joi.number().integer().min(1).required()
  })
};

module.exports = schemas;