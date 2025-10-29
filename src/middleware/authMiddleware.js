const jwt = require('jsonwebtoken');
const users = require('../models/userModel');

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.accessToken;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await users.findById(payload.userId);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    next();
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 401 : 401;
    res.status(code).json({ error: 'Unauthorized' });
  }
}

function optionalAuth(req, _res, next) {
  try {
    const token = req.cookies?.accessToken;
    if (!token) return next();
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
  } catch (_) {}
  next();
}

module.exports = { requireAuth, optionalAuth };
