'use strict';

const pool = require('../config/db');

const mapRow = (row) => ({
  id: row.id,
  type: row.type,
  userId: row.user_id,
  requestId: row.request_id,
  ipAddress: row.ip_address,
  userAgent: row.user_agent,
  source: row.source,
  metadata: row.metadata || {},
  createdAt: row.created_at,
});

async function insertEvent({ type, userId, requestId, ipAddress, userAgent, source, metadata }) {
  if (!type) throw new Error('event type is required');
  const now = new Date();
  const params = [
    type,
    userId || null,
    requestId || null,
    ipAddress || null,
    userAgent || null,
    source || null,
    metadata || null,
    now,
  ];
  const { rows } = await pool.query(
    `INSERT INTO events (
      type, user_id, request_id, ip_address, user_agent, source, metadata, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *;`,
    params
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

module.exports = {
  insertEvent,
};
