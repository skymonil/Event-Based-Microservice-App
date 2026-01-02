const Joi = require("joi");

const userIdParamSchema = Joi.object({
  id: Joi.string().uuid().required()
});
const createUserSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

module.exports = {
  createUserSchema,
  loginSchema,
  userIdParamSchema
};
