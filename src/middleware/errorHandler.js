'use strict';

const logger = require('../utils/logger');

// Central error handler returning consistent JSON shape; avoid leaking stack in responses
function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.expose ? err.message : (err.message || 'Internal Server Error');

  logger.error(message, {
    requestId: req.id,
    status,
    code,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });

  res.status(status).json({
    error: { message, code },
    requestId: req.id,
  });
}

module.exports = { errorHandler };
