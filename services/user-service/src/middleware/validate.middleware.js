// middleware/validate.middleware.js

const { AppError } = require("@my-app/common");

const validate =
  (schema, source = "body") =>
  (req, _res, next) => {

    const data =
      source === "params"
        ? req.params
        : source === "query"
        ? req.query
        : req.body;

    const { error } =
      schema.validate(data);

    if (error) {

      const message =
        error.details
          .map(i => i.message)
          .join(", ");

      return next(
        new AppError({
          status: 400,
          title: "Bad Request",
          detail: message,
          type: "/problems/validation-error"
        })
      );

    }

    next();
};

module.exports = validate;