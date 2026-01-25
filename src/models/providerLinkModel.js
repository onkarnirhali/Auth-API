'use strict';

const pool = require('../config/db');

const mapRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  provider: row.provider,
  linked: row.linked,
  ingestEnabled: row.ingest_enabled,
  lastLinkedAt: row.last_linked_at,
  lastSyncAt: row.last_sync_at,
  metadata: row.metadata || {},
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function listByUser(userId) {
  const { rows } = await pool.query(
    `
    SELECT * FROM user_provider_links
    WHERE user_id = $1
    ORDER BY provider ASC;
    `,
    [userId]
  );
  return rows.map(mapRow);
}

async function upsertLink({ userId, provider, linked, ingestEnabled, metadata, lastLinkedAt, lastSyncAt }) {
  if (!userId || !provider) throw new Error('userId and provider are required for provider link');
  const now = new Date();
  const params = [
    userId,
    provider,
    linked,
    ingestEnabled,
    metadata || {},
    lastLinkedAt || null,
    lastSyncAt || null,
    now,
    now,
  ];
  const { rows } = await pool.query(
    `
    INSERT INTO user_provider_links (
      user_id, provider, linked, ingest_enabled, metadata, last_linked_at, last_sync_at, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (user_id, provider) DO UPDATE
      SET linked = EXCLUDED.linked,
          ingest_enabled = EXCLUDED.ingest_enabled,
          metadata = EXCLUDED.metadata,
          last_linked_at = EXCLUDED.last_linked_at,
          last_sync_at = EXCLUDED.last_sync_at,
          updated_at = EXCLUDED.updated_at
    RETURNING *;
    `,
    params
  );
  return mapRow(rows[0]);
}

async function updateIngest(userId, provider, ingestEnabled) {
  const now = new Date();
  const { rows } = await pool.query(
    `
    UPDATE user_provider_links
    SET ingest_enabled = $3, updated_at = $4
    WHERE user_id = $1 AND provider = $2
    RETURNING *;
    `,
    [userId, provider, ingestEnabled, now]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

module.exports = {
  listByUser,
  upsertLink,
  updateIngest,
};
