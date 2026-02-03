'use strict';

// Per-user Outlook sync cursor (receivedDateTime + message id) for incremental Graph fetch

const pool = require('../config/db');

const mapRow = (row) => ({
  userId: row.user_id,
  lastReceivedAt: row.last_received_at,
  lastMessageId: row.last_message_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function getByUserId(userId) {
  const { rows } = await pool.query('SELECT * FROM outlook_sync_cursors WHERE user_id = $1', [userId]);
  return rows[0] ? mapRow(rows[0]) : null;
}

async function upsertCursor({ userId, lastReceivedAt, lastMessageId }) {
  if (!userId) throw new Error('userId is required to upsert outlook sync cursor');
  const now = new Date();
  const params = [userId, lastReceivedAt || null, lastMessageId || null, now, now];
  const { rows } = await pool.query(
    `INSERT INTO outlook_sync_cursors (user_id, last_received_at, last_message_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id) DO UPDATE
     SET last_received_at = EXCLUDED.last_received_at,
         last_message_id = EXCLUDED.last_message_id,
         updated_at = EXCLUDED.updated_at
     RETURNING *;`,
    params
  );
  return mapRow(rows[0]);
}

module.exports = {
  getByUserId,
  upsertCursor,
};
