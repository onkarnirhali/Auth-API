const pool = require('../config/db');

const mapUser = (row) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  providerId: row.provider_id,
  providerName: row.provider_name,
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

module.exports = { findByEmail, findById, create };
