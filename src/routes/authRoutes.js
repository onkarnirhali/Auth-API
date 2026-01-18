const express = require('express');
const passport = require('passport');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { rateLimit } = require('../middleware/rateLimit');

const {
  handleGoogleCallback,
  logout,
  refreshAccessToken,
} = require('../controllers/authController');
const { getGoogleScopes } = require('../utils/googleScopes');

const googleAuthOptions = {
  scope: getGoogleScopes(),
  accessType: 'offline',
  prompt: 'consent',
  includeGrantedScopes: true,
};

// Simple ping to verify router mount
router.get('/ping', (req, res) => res.json({ ok: true }));

const loginLimiter = rateLimit({
  windowMs: Number(process.env.RL_LOGIN_WINDOW_MS || 60_000),
  max: Number(process.env.RL_LOGIN_MAX || 20),
  keyGenerator: (req) => req.ip,
  message: 'Too many login attempts, please slow down',
});

// OAuth routes: kickoff and callback for Google
router.get('/google',
  loginLimiter,
  passport.authenticate('google', googleAuthOptions)
);

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth/failure' }),
  handleGoogleCallback
);

router.get('/failure', (req, res) => res.status(401).json({ error: 'OAuth failed' }));

// Token routes (support POST and GET for easier manual testing)
const refreshLimiter = rateLimit({
  windowMs: Number(process.env.RL_REFRESH_WINDOW_MS || 60_000), // 1 min default
  max: Number(process.env.RL_REFRESH_MAX || 10),
  keyGenerator: (req) => req.ip,
  message: 'Too many refresh attempts, please slow down',
});
router.post('/refresh', refreshLimiter, refreshAccessToken);
router.get('/refresh', refreshLimiter, refreshAccessToken);

// Logout (requires auth) + light limit
const logoutLimiter = rateLimit({
  windowMs: Number(process.env.RL_LOGOUT_WINDOW_MS || 60_000),
  max: Number(process.env.RL_LOGOUT_MAX || 10),
  keyGenerator: (req) => req.ip,
  message: 'Too many logout attempts',
});
router.post('/logout', logoutLimiter, requireAuth, logout);
router.get('/logout', logoutLimiter, requireAuth, logout);

// Current user
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Router-level 404 for unmatched /auth paths (debug aid)
router.use((req, res) => {
  res.status(404).json({ error: 'Auth route not found', method: req.method, path: req.originalUrl });
});

module.exports = router;
