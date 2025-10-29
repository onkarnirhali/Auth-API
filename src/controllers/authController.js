const jwt = require('jsonwebtoken');
const tokens = require('../services/tokenService');

// Generate JWT access token
const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
};

// Generate refresh token
const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
};

// Handle successful login from Google OAuth
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
    .cookie('refreshToken', refreshToken, { ...cookieBase, maxAge: 7 * 24 * 60 * 60 * 1000 })
    .json({ success: true })
};

// Handle logout
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

// Handle refresh token logic
const refreshAccessToken = async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) return res.status(401).send('No refresh token');

  try {
    const accessPayload = jwt.decode(req.cookies?.accessToken || '') || {};
    const userId = req.user?.id || accessPayload.userId;
    if (!userId) return res.status(401).send('Unauthenticated');

    const valid = await tokens.verifyRefreshToken({ userId, token });
    if (!valid) return res.status(403).send('Invalid refresh token');

    await tokens.revokeRefreshToken({ userId, token });
    const newRefresh = tokens.generateRefreshToken();
    await tokens.storeRefreshToken({ userId, token: newRefresh, userAgent: req.get('user-agent'), ip: req.ip });

    const newAccessToken = tokens.generateAccessToken(userId);
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
  } catch (err) {
    res.status(403).send('Invalid refresh token');
  }
};

module.exports = {
  handleGoogleCallback,
  logout,
  refreshAccessToken,
};
