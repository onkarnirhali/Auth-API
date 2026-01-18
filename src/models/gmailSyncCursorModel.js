'use strict';

// Per-user Gmail sync position for incremental ingestion (history/internal date/message id)

const pool = require('../config/db');

const mapRow = (row) => ({
  userId: row.user_id,
  lastHistoryId: row.last_history_id ? Number(row.last_history_id) : null,
  lastInternalDateMs: row.last_internal_date_ms ? Number(row.last_internal_date_ms) : null,
  lastGmailMessageId: row.last_gmail_message_id || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function getByUserId(userId) {
  const { rows } = await pool.query('SELECT * FROM gmail_sync_cursors WHERE user_id = $1', [userId]);
  return rows[0] ? mapRow(rows[0]) : null;
}

async function upsertCursor({ userId, lastHistoryId, lastInternalDateMs, lastGmailMessageId }) {
  if (!userId) throw new Error('userId is required to upsert gmail sync cursor');
  const now = new Date();
  const params = [
    userId,
    lastHistoryId || null,
    lastInternalDateMs || null,
    lastGmailMessageId || null,
    now,
    now,
  ];
  const { rows } = await pool.query(
    `
    INSERT INTO gmail_sync_cursors (user_id, last_history_id, last_internal_date_ms, last_gmail_message_id, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (user_id) DO UPDATE
    SET last_history_id = EXCLUDED.last_history_id,
        last_internal_date_ms = EXCLUDED.last_internal_date_ms,
        last_gmail_message_id = EXCLUDED.last_gmail_message_id,
        updated_at = EXCLUDED.updated_at
    RETURNING *;
    `,
    params
  );
  return mapRow(rows[0]);
}

module.exports = {
  getByUserId,
  upsertCursor,
};
