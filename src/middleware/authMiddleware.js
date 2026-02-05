const jwt = require('jsonwebtoken');
const users = require('../models/userModel');
const logger = require('../utils/logger');

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.accessToken;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    // Verify access token and hydrate req.user for downstream handlers
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await users.findById(payload.userId);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (user.isEnabled === false) return res.status(403).json({ error: 'Account disabled' });
    req.user = user;
    // Best-effort: update last_active_at with throttling to avoid frequent writes
    try {
      await users.touchLastActive(user.id, Number(process.env.USER_LAST_ACTIVE_MINUTES || 5));
    } catch (err) {
      logger.error('Failed to update last_active_at', { userId: user.id, message: err?.message });
    }
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

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
}

module.exports = { requireAuth, optionalAuth, requireAdmin };
