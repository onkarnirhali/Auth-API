const pool = require('../config/db');

// Basic user persistence helpers for auth flows
const mapUser = (row) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  providerId: row.provider_id,
  providerName: row.provider_name,
  role: row.role || 'user',
  isEnabled: row.is_enabled !== false,
  lastActiveAt: row.last_active_at || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function findByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] ? mapUser(rows[0]) : null;
}

async function findById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ? mapUser(rows[0]) : null;
}

async function listAllIds() {
  const { rows } = await pool.query('SELECT id FROM users');
  return rows.map((r) => r.id);
}

async function create({ email, name, providerId, providerName }) {
  const now = new Date();
  const { rows } = await pool.query(
    `INSERT INTO users (email, name, provider_id, provider_name, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [email, name, providerId, providerName, now, now]
  );
  return mapUser(rows[0]);
}

async function touchLastActive(userId, minMinutes = 5) {
  if (!userId) return false;
  const minutes = Number.isFinite(Number(minMinutes)) && Number(minMinutes) > 0 ? Math.floor(Number(minMinutes)) : 5;
  const { rowCount } = await pool.query(
    `UPDATE users
     SET last_active_at = NOW(), updated_at = NOW()
     WHERE id = $1
       AND (last_active_at IS NULL OR last_active_at < NOW() - ($2 * INTERVAL '1 minute'))`,
    [userId, minutes]
  );
  return rowCount > 0;
}

module.exports = { findByEmail, findById, listAllIds, create, touchLastActive };
