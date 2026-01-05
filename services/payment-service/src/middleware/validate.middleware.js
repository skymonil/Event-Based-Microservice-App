const AppError = require("../utils/app-error");

/**
 * Generic Joi validation middleware
 *
 * @param {Joi.Schema} schema - Joi schema
 * @param {string} property - req property to validate (body, params, query)
 */
const validate = (schema, property = "body") => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false
    });

    if (error) {
      const details = error.details.map(d => d.message).join(", ");

      return next(
        new AppError({
          type: "https://payment-service/problems/validation-error",
          title: "Validation Error",
          status: 400,
          detail: details
        })
      );
    }

    // Replace request object with validated & sanitized value
    req[property] = value;
    next();
  };
};

module.exports = validate;
