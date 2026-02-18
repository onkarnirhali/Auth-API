'use strict';

const pool = require('../config/db');
const { encrypt, decrypt } = require('../utils/encryption');
const { normalizeScope } = require('../utils/scopes');

const mapRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  accessToken: row.access_token,
  refreshToken: row.refresh_token_enc ? decrypt(row.refresh_token_enc) : null,
  tokenType: row.token_type,
  scope: row.scope,
  expiresAt: row.expires_at,
  tenantId: row.tenant_id,
  accountEmail: row.account_email,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function upsertToken({ userId, accessToken, refreshToken, tokenType, scope, expiresAt, tenantId, accountEmail }) {
  if (!userId || !accessToken || !refreshToken) {
    throw new Error('userId, accessToken, and refreshToken are required to persist Outlook tokens');
  }
  const now = new Date();
  const normalizedScope = normalizeScope(scope);
  const params = [
    userId,
    accessToken,
    encrypt(refreshToken),
    tokenType || null,
    normalizedScope,
    expiresAt || null,
    tenantId || null,
    accountEmail || null,
    now,
    now,
  ];
  const { rows } = await pool.query(
    `INSERT INTO outlook_tokens (
        user_id, access_token, refresh_token_enc, token_type, scope, expires_at, tenant_id, account_email, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (user_id) DO UPDATE
       SET access_token = EXCLUDED.access_token,
           refresh_token_enc = EXCLUDED.refresh_token_enc,
           token_type = EXCLUDED.token_type,
           scope = EXCLUDED.scope,
           expires_at = EXCLUDED.expires_at,
           tenant_id = EXCLUDED.tenant_id,
           account_email = EXCLUDED.account_email,
           updated_at = EXCLUDED.updated_at
     RETURNING *`,
    params
  );
  return mapRow(rows[0]);
}

async function updateAccessToken({ userId, accessToken, refreshToken, expiresAt, scope, tokenType }) {
  const now = new Date();
  if (!userId || !accessToken) throw new Error('userId and accessToken required to update Outlook token');

  if (refreshToken) {
    const params = [
      accessToken,
      encrypt(refreshToken),
      tokenType || null,
      normalizeScope(scope),
      expiresAt || null,
      now,
      userId,
    ];
    const { rows } = await pool.query(
      `UPDATE outlook_tokens
       SET access_token = $1,
           refresh_token_enc = $2,
           token_type = $3,
           scope = $4,
           expires_at = $5,
           updated_at = $6
       WHERE user_id = $7
       RETURNING *;`,
      params
    );
    return rows[0] ? mapRow(rows[0]) : null;
  } else {
    const params = [
      accessToken,
      tokenType || null,
      normalizeScope(scope),
      expiresAt || null,
      now,
      userId,
    ];
    const { rows } = await pool.query(
      `UPDATE outlook_tokens
       SET access_token = $1,
           token_type = $2,
           scope = $3,
           expires_at = $4,
           updated_at = $5
       WHERE user_id = $6
       RETURNING *;`,
      params
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }
}

async function findByUserId(userId) {
  const { rows } = await pool.query('SELECT * FROM outlook_tokens WHERE user_id = $1', [userId]);
  return rows[0] ? mapRow(rows[0]) : null;
}

async function removeByUserId(userId) {
  await pool.query('DELETE FROM outlook_tokens WHERE user_id = $1', [userId]);
}

module.exports = {
  upsertToken,
  updateAccessToken,
  findByUserId,
  removeByUserId,
};
