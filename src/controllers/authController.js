const jwt = require('jsonwebtoken');

// Generate JWT access token
const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
};

// Generate refresh token
const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
};

// Handle successful login from Google OAuth
const handleGoogleCallback = (req, res) => {
  const user = req.user;

  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  // Optionally store refreshToken in DB for tracking/revocation

  res
    .cookie('accessToken', accessToken, { httpOnly: true })
    .cookie('refreshToken', refreshToken, { httpOnly: true })
    .redirect('/auth/success'); // Or send JSON response for frontend to handle
};

// Handle logout
const logout = (req, res) => {
  res
    .clearCookie('accessToken')
    .clearCookie('refreshToken')
    .send('Logged out');
};

// Handle refresh token logic
const refreshAccessToken = (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).send('No refresh token');

  try {
    const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    const newAccessToken = generateAccessToken(payload.userId);

    res
      .cookie('accessToken', newAccessToken, { httpOnly: true })
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