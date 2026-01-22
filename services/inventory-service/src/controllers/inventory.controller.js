// src/controllers/inventory.controller.js
const readService = require("../services/inventory.read.service");
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
 * 3. Check Availability (CQRS Implemented)
 */
const checkAvailability = async (req, res, next) => {
  try {
    const productId = req.query.productId;
    // Ensure quantity is a number
    const quantity = parseInt(req.query.quantity, 10) || 1;
    const warehouseId = req.query.warehouseId;

    // ====================================================
    // 🚀 STEP 1: TRY REDIS FIRST (Fast Path)
    // ====================================================
    // Optimization: Redis only stores global stock usually. 
    // If a specific warehouse is requested, skip to DB (unless you model per-warehouse in Redis)
    if (!warehouseId) {
      try {
        const cachedStock = await readService.getProductAvailability(productId);

        if (cachedStock.source === "redis") {
          const isAvailable = cachedStock.available >= quantity;
          
          // Return exact structure matching DB response
          return res.json({
            productId,
            requestedQuantity: quantity,
            availableQuantity: cachedStock.available,
            isAvailable,
            warehouseId: "ALL",
            source: "cache"
          });
        }
      } catch (err) {
        // Log but don't fail request
        logger.warn({ err }, "⚠️ Redis read failed, falling back to DB");
      }
    }

    // ====================================================
    // 🐢 STEP 2: FALLBACK TO POSTGRES (Slow Path)
    // ====================================================
    const dbResult = await inventoryService.checkAvailability({ 
        productId, 
        quantity, 
        warehouseId 
    });
    
    return res.json({ ...dbResult, source: "db" });

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