const validate = (schema, property = "body") => {
  return (req, res, next) => {
    const { error } = schema.validate(req[property]);

    if (error) {
      return res.status(400).json({
        error: error.details[0].message
      });
    }

    next();
  };
};

module.exports = validate;
