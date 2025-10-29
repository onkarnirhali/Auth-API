function validationMiddleware(validator) {
  return (req, res, next) => {
    try {
      const { errors, value } = validator(req);
      if (errors && errors.length) {
        return res.status(422).json({ error: 'Validation failed', details: errors });
      }
      if (value) {
        if (value.body) req.body = value.body;
        if (value.query) req.query = value.query;
        if (value.params) req.params = value.params;
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

module.exports = { validationMiddleware };

