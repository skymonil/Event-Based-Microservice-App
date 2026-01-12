const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    // property can be 'body', 'query', or 'params'
    const { error } = schema.validate(req[property]);
    
    if (error) {
      const { details } = error;
      const message = details.map(i => i.message).join(',');
      
      return res.status(400).json({
        error: "Validation Failed",
        message: message
      });
    }
    next();
  };
};

module.exports = validate;