const jwt = require('jsonwebtoken');
const tokens = require('../services/tokenService');
const { logEventSafe } = require('../services/eventService');

// Generate JWT access token
const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
};

// Generate refresh token
const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
};

// Handle successful login from Google OAuth: issues access/refresh cookies and redirects to frontend when configured
const handleGoogleCallback = async (req, res) => {
  const user = req.user;

  const accessToken = tokens.generateAccessToken(user.id);
  const refreshToken = tokens.generateRefreshToken();
  await tokens.storeRefreshToken({
    userId: user.id,
    token: refreshToken,
    userAgent: req.get('user-agent'),
    ip: req.ip,
  });

  const cookieBase = {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
  };

  res
    .cookie('accessToken', accessToken, { ...cookieBase, maxAge: 15 * 60 * 1000 })
    .cookie('refreshToken', refreshToken, { ...cookieBase, maxAge: 7 * 24 * 60 * 60 * 1000 });

  await logEventSafe({
    type: 'auth.login.success',
    userId: user.id,
    requestId: req.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    source: 'google',
    metadata: { provider: 'google' },
  });

  // Prefer redirect to frontend after successful login; allowlist to prevent open redirects
  const allowed = (process.env.ALLOWED_REDIRECTS || process.env.FRONTEND_URL || process.env.CORS_ORIGIN || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const frontend = allowed[0] || null;
  const redirectPath = process.env.LOGIN_SUCCESS_REDIRECT_PATH || '/app';
  if (frontend) {
    try {
      return res.redirect(302, `${frontend}${redirectPath}`);
    } catch (_) {}
  }
  // Fallback JSON response
  return res.json({ success: true })
};

// Handle logout: revoke refresh token if present and clear cookies
const logout = async (req, res) => {
  const refresh = req.cookies?.refreshToken;
  const userId = req.user?.id || null;
  if (refresh && userId) {
    try { await tokens.revokeRefreshToken({ userId, token: refresh }); } catch (_) {}
  }
  res
    .clearCookie('accessToken', { path: '/' })
    .clearCookie('refreshToken', { path: '/' })
    .send('Logged out');
};

// Refresh access token using current refresh token; rotates refresh token for safety
const refreshAccessToken = async (req, res) => {
  const token = req.cookies?.refreshToken;
  const accessPayload = jwt.decode(req.cookies?.accessToken || '') || {};
  const userId = req.user?.id || accessPayload.userId || null;
  if (!token) {
    await logEventSafe({
      type: 'auth.refresh.failed',
      userId,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      source: 'auth',
      metadata: { reason: 'missing_refresh_token' },
    });
    return res.status(401).send('No refresh token');
  }

  try {
    const resolvedUserId = userId;
    if (!resolvedUserId) {
      await logEventSafe({
        type: 'auth.refresh.failed',
        userId: null,
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        source: 'auth',
        metadata: { reason: 'missing_user' },
      });
      return res.status(401).send('Unauthenticated');
    }

    const valid = await tokens.verifyRefreshToken({ userId: resolvedUserId, token });
    if (!valid) {
      await logEventSafe({
        type: 'auth.refresh.failed',
        userId: resolvedUserId,
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        source: 'auth',
        metadata: { reason: 'invalid_refresh_token' },
      });
      return res.status(403).send('Invalid refresh token');
    }

    await tokens.revokeRefreshToken({ userId: resolvedUserId, token });
    const newRefresh = tokens.generateRefreshToken();
    await tokens.storeRefreshToken({ userId: resolvedUserId, token: newRefresh, userAgent: req.get('user-agent'), ip: req.ip });

    const newAccessToken = tokens.generateAccessToken(resolvedUserId);
    const cookieBase = {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production',
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: '/',
    };
    res
      .cookie('accessToken', newAccessToken, { ...cookieBase, maxAge: 15 * 60 * 1000 })
      .cookie('refreshToken', newRefresh, { ...cookieBase, maxAge: 7 * 24 * 60 * 60 * 1000 })
      .send('Access token refreshed');
    await logEventSafe({
      type: 'auth.refresh.success',
      userId: resolvedUserId,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      source: 'auth',
    });
  } catch (err) {
    await logEventSafe({
      type: 'auth.refresh.failed',
      userId,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      source: 'auth',
      metadata: { reason: 'exception', message: err?.message },
    });
    res.status(403).send('Invalid refresh token');
  }
};

module.exports = {
  handleGoogleCallback,
  logout,
  refreshAccessToken,
};
