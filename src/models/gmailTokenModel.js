'use strict';

const pool = require('../config/db');
const { normalizeScope } = require('../utils/scopes');

// Persists Google OAuth tokens (access/refresh) per user for Gmail access
const mapRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  accessToken: row.access_token,
  refreshToken: row.refresh_token,
  tokenType: row.token_type,
  scope: row.scope,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function upsertToken({ userId, accessToken, refreshToken, tokenType, scope, expiresAt }) {
  if (!userId || !accessToken) {
    throw new Error('userId and accessToken are required to persist Gmail tokens');
  }

  const now = new Date();
  const normalizedScope = normalizeScope(scope);
  const params = [
    userId,
    accessToken,
    refreshToken || null,
    tokenType || null,
    normalizedScope,
    expiresAt || null,
    now,
    now,
  ];

  const { rows } = await pool.query(
    `INSERT INTO gmail_tokens (
        user_id,
        access_token,
        refresh_token,
        token_type,
        scope,
        expires_at,
        created_at,
        updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (user_id) DO UPDATE
       SET access_token = EXCLUDED.access_token,
           refresh_token = COALESCE(EXCLUDED.refresh_token, gmail_tokens.refresh_token),
           token_type = EXCLUDED.token_type,
           scope = EXCLUDED.scope,
           expires_at = EXCLUDED.expires_at,
           updated_at = EXCLUDED.updated_at
     RETURNING *`,
    params
  );
  return mapRow(rows[0]);
}

async function findByUserId(userId) {
  const { rows } = await pool.query('SELECT * FROM gmail_tokens WHERE user_id = $1', [userId]);
  return rows[0] ? mapRow(rows[0]) : null;
}

async function removeByUserId(userId) {
  await pool.query('DELETE FROM gmail_tokens WHERE user_id = $1', [userId]);
}

module.exports = {
  upsertToken,
  findByUserId,
  removeByUserId,
};
