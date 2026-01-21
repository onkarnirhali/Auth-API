'use strict';

const pool = require('../config/db');

// Persisted AI suggestions per user; separate from todos to allow review/acceptance
const mapRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  detail: row.detail,
  sourceMessageIds: row.source_message_ids || [],
  confidence: row.confidence,
  status: row.status,
  metadata: row.metadata || {},
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function listByUser(userId, options = {}) {
  const limit = Number(options.limit) || 20;
  const status = options.status || 'suggested';
  const params = [userId, limit];
  const statusClause = status === 'all' || !status ? '' : 'AND status = $3';
  if (statusClause) params.push(status);

  const { rows } = await pool.query(
    `
    SELECT * FROM ai_suggestions
    WHERE user_id = $1
    ${statusClause}
    ORDER BY created_at DESC
    LIMIT $2;
    `,
    params
  );
  return rows.map(mapRow);
}

async function replaceForUser(userId, suggestions) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Replace strategy keeps only latest generated set to avoid duplicates/stale entries
    await client.query('DELETE FROM ai_suggestions WHERE user_id = $1', [userId]);

    const inserted = [];
    for (const suggestion of suggestions || []) {
      const now = new Date();
      const params = [
        userId,
        suggestion.title,
        suggestion.detail || null,
        suggestion.sourceMessageIds || [],
        typeof suggestion.confidence === 'number' ? suggestion.confidence : null,
        suggestion.status || 'suggested',
        suggestion.metadata || {},
        now,
        now,
      ];
      const { rows } = await client.query(
        `
        INSERT INTO ai_suggestions (
          user_id, title, detail, source_message_ids, confidence, status, metadata, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *;
        `,
        params
      );
      inserted.push(mapRow(rows[0]));
    }
    await client.query('COMMIT');
    return inserted;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateStatus(id, userId, status, metadataPatch) {
  const now = new Date();
  const params = [id, userId, status, now];
  let query = `
    UPDATE ai_suggestions
    SET status = $3, updated_at = $4
    WHERE id = $1 AND user_id = $2
    RETURNING *;
  `;

  if (metadataPatch && Object.keys(metadataPatch).length > 0) {
    params.push(metadataPatch);
    query = `
      UPDATE ai_suggestions
      SET status = $3,
          metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb,
          updated_at = $4
      WHERE id = $1 AND user_id = $2
      RETURNING *;
    `;
  }

  const { rows } = await pool.query(query, params);
  return rows[0] ? mapRow(rows[0]) : null;
}

async function bulkUpdateStatus(userId, ids, status, metadataPatch) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const now = new Date();
  const params = [userId, ids, status, now];
  let query = `
    UPDATE ai_suggestions
    SET status = $3, updated_at = $4
    WHERE user_id = $1 AND id = ANY($2)
    RETURNING *;
  `;
  if (metadataPatch && Object.keys(metadataPatch).length > 0) {
    params.push(metadataPatch);
    query = `
      UPDATE ai_suggestions
      SET status = $3,
          metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb,
          updated_at = $4
      WHERE user_id = $1 AND id = ANY($2)
      RETURNING *;
    `;
  }

  const { rows } = await pool.query(query, params);
  return rows.map(mapRow);
}

module.exports = {
  listByUser,
  replaceForUser,
  updateStatus,
  bulkUpdateStatus,
};
