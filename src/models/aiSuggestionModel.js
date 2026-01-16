'use strict';

const pool = require('../config/db');

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

async function listByUser(userId, limit = 20) {
  const { rows } = await pool.query(
    `
    SELECT * FROM ai_suggestions
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2;
    `,
    [userId, limit]
  );
  return rows.map(mapRow);
}

async function replaceForUser(userId, suggestions) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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

async function updateStatus(id, userId, status) {
  const now = new Date();
  const { rows } = await pool.query(
    `
    UPDATE ai_suggestions
    SET status = $3, updated_at = $4
    WHERE id = $1 AND user_id = $2
    RETURNING *;
    `,
    [id, userId, status, now]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

module.exports = {
  listByUser,
  replaceForUser,
  updateStatus,
};
