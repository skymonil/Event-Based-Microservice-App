// src/routes/user.routes.js
const express = require("express");
const router = express.Router();
const validate = require("../middleware/validate.middleware.js");
const {
  createUser,
  getUserById,
  loginUser
} = require("../controllers/user.contoller.js");
const { createUserSchema, loginSchema, userIdParamSchema } = require("../validators/user.validator");
// Create a new user
router.post("/users", validate(createUserSchema), createUser);

// Get user by ID
router.get("/users/:id", validate(userIdParamSchema, "params"), getUserById);

// Login user
router.post("/login", validate(loginSchema), loginUser);

module.exports = router;
