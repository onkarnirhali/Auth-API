const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const ACCESS_EXPIRES_SEC = 15 * 60; // 15m
const REFRESH_EXPIRES_SEC = 7 * 24 * 60 * 60; // 7d

function cookieBase() {
  return {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
  };
}

function generateAccessToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: ACCESS_EXPIRES_SEC });
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function storeRefreshToken({ userId, token, userAgent, ip }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REFRESH_EXPIRES_SEC * 1000);
  const tokenHash = hashToken(token);
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip_address, expires_at, revoked_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, tokenHash, userAgent || null, ip || null, expiresAt, null, now, now]
  );
}

async function verifyRefreshToken({ userId, token }) {
  const tokenHash = hashToken(token);
  const { rows } = await pool.query(
    `SELECT * FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2 AND revoked_at IS NULL AND expires_at > NOW()`,
    [userId, tokenHash]
  );
  return rows[0] || null;
}

async function revokeRefreshToken({ userId, token }) {
  const tokenHash = hashToken(token);
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW(), updated_at = NOW() WHERE user_id = $1 AND token_hash = $2 AND revoked_at IS NULL`,
    [userId, tokenHash]
  );
}

async function revokeAllUserTokens(userId) {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW(), updated_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

function setAuthCookies(res, { accessToken, refreshToken }) {
  const base = cookieBase();
  res
    .cookie('accessToken', accessToken, { ...base, maxAge: ACCESS_EXPIRES_SEC * 1000 })
    .cookie('refreshToken', refreshToken, { ...base, maxAge: REFRESH_EXPIRES_SEC * 1000 });
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  storeRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  setAuthCookies,
};

