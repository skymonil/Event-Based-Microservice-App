// src/routes/inventory.routes.js
const express = require("express");
const router = express.Router();

const inventoryController = require("../controllers/inventory.controller");
const validate = require("../middleware/validate.middleware");
const inventoryValidator = require("../validators/inventory.validator");

/**
 * 📦 Product & Stock Management (Admin/Internal)
 */
router.post(
  "/products",
  validate(inventoryValidator.createProduct),
  inventoryController.createProduct
);

// RESTful adjustment: Action is scoped to the product
router.post(
  "/products/:productId/adjust",
  validate(inventoryValidator.adjustStock),
  inventoryController.adjustStock
);

/**
 * 🔍 Availability Checks (High Traffic)
 * Kept separate because this is hit by the Frontend/Order Service constantly
 */
router.get(
  "/availability", 
  validate(inventoryValidator.checkAvailability, 'query'), 
  inventoryController.checkAvailability
);

/**
 * 📖 Read APIs (Support/Debugging)
 */
router.get(
  "/products/:productId",
  inventoryController.getProduct
);

// Critical for debugging Sagas
router.get(
  "/orders/:orderId/reservations",
  inventoryController.getReservationsByOrder
);


module.exports = router;