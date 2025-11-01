function sendError(req, res, status, message, code, extra = {}) {
  const body = {
    error: {
      message,
      code,
      ...extra,
    },
    requestId: req.id,
  };
  return res.status(status).json(body);
}

module.exports = { sendError };
