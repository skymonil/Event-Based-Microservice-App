// src/validators/inventory.validator.js
const Joi = require("joi");

/**
 * Shared Building Blocks
 */
const uuidParam = Joi.string().uuid().required();

/**
 * 1. Create Product (Master Data)
 * Used by: POST /products
 */
const createProduct = Joi.object({
  id: Joi.string().uuid().required(), // Explicit ID usually required for distributed consistency
  name: Joi.string().min(3).max(100).required(),
  sku: Joi.string()
    .pattern(/^[a-zA-Z0-9-_]+$/)
    .message('SKU can only contain letters, numbers, hyphens (-), and underscores (_)')
    .min(3)
    .max(50)
    .required()
});

/**
 * 2. Adjust Stock (Admin/WMS)
 * Used by: POST /products/:productId/adjust
 */
const adjustStock = Joi.object({
  warehouseId: Joi.string().uuid().required(),
  quantity: Joi.number().integer().required(), // Can be negative to reduce stock
  mode: Joi.string().valid('ADD', 'SET').default('ADD')
});

/**
 * 3. Check Availability (Public)
 * Used by: GET /availability?productId=...&quantity=...
 */
const checkAvailability = Joi.object({
  productId: Joi.string().uuid().required(),
  quantity: Joi.number().integer().min(1).default(1), // Default to checking 1 item
  warehouseId: Joi.string().uuid().optional() // Optional: Check specific warehouse only
});

/**
 * 4. Param Validators
 * Used for route parameters like /products/:productId
 */
const productIdParam = Joi.object({
  productId: uuidParam
});

const orderIdParam = Joi.object({
  orderId: uuidParam
});

module.exports = {
  createProduct,
  adjustStock,
  checkAvailability,
  productIdParam,
  orderIdParam
};