// src/controllers/inventory.controller.js
const inventoryService = require("../services/inventory.service");
const { logger } = require("../utils/logger");

/**
 * 1. Create Product
 */
const createProduct = async (req, res, next) => {
  try {
    const { id, sku } = req.body;
    logger.info({ id, sku }, "📝 Request received to create new product");

    const newProduct = await inventoryService.createProduct(req.body);
    
    logger.info({ id }, "✅ Product created successfully");
    res.status(201).json(newProduct);
  } catch (error) {
    next(error);
  }
};

/**
 * 2. Adjust Stock
 */
const adjustStock = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { warehouseId, quantity, mode } = req.body;

    logger.info(
      { productId, warehouseId, quantity, mode },
      "⚖️ Request received to adjust stock"
    );

    const updatedStock = await inventoryService.adjustStock({
      productId,
      warehouseId,
      quantity,
      mode
    });

    logger.info({ productId, warehouseId }, "✅ Stock adjustment committed");
    
    res.status(200).json({
      message: "Stock adjusted successfully",
      stock: updatedStock,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 3. Check Availability
 * NOTE: We avoid logging INFO here because this is a high-traffic endpoint.
 * Use DEBUG level if you need to trace it during development.
 */
const checkAvailability = async (req, res, next) => {
  try {
    const { productId, quantity, warehouseId } = req.query;

    // logger.debug({ productId, quantity }, "Checking availability"); 

    const result = await inventoryService.checkAvailability({
      productId,
      quantity,
      warehouseId
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * 4. Get Product Details
 */
const getProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;
    // Good for debugging specific product issues
    logger.debug({ productId }, "Fetching product details"); 
    
    const product = await inventoryService.getProductDetails(productId);
    res.status(200).json(product);
  } catch (error) {
    next(error);
  }
};

/**
 * 5. Get Reservations by Order
 */
const getReservationsByOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    logger.info({ orderId }, "🔎 Fetching reservations for order");

    const reservations = await inventoryService.getReservationsByOrder(orderId);
    res.status(200).json(reservations);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createProduct,
  adjustStock,
  checkAvailability,
  getProduct,
  getReservationsByOrder,
};