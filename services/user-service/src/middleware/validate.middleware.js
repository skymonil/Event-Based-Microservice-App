
const AppError = require("../utils/app-error");
const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body);
  if (error) {
    const message = error.details.map(i => i.message).join(',');
    
    // 🟢 PASS TO ERROR HANDLER (Don't res.json here!)
    return next(new AppError({
      title: "Bad Request",
      status: 400,
      detail: message
    }));
  }
  next();
};

module.exports = validate;
