// src/validators/user.validator.js
const Joi = require("joi");

const createUserSchema = Joi.object({
    name: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required()
});

const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});

const userIdParamSchema = Joi.object({
    id: Joi.string().uuid().required()
});

module.exports = {
    createUserSchema,
    loginSchema,
    userIdParamSchema
};