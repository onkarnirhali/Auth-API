'use strict';

if (process.env.NODE_ENV !== 'production') {
  const path = require('path');
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

// One-time script to promote an existing user to admin by email.
// Usage: node scripts/promoteAdmin.js --email someone@example.com

const pool = require('../src/config/db');

function parseEmailArg() {
  const args = process.argv.slice(2);
  const flagIdx = args.findIndex((a) => a === '--email' || a === '-e');
  if (flagIdx !== -1 && args[flagIdx + 1]) return args[flagIdx + 1];
  return process.env.ADMIN_EMAIL || process.env.EMAIL || null;
}

async function run() {
  const emailRaw = parseEmailArg();
  if (!emailRaw) {
    console.error('Missing email. Use: node scripts/promoteAdmin.js --email someone@example.com');
    process.exit(2);
  }
  const email = String(emailRaw).trim().toLowerCase();

  const { rows } = await pool.query('SELECT id, email, role FROM users WHERE lower(email) = $1', [email]);
  if (!rows[0]) {
    console.error(`User not found for email ${email}. Please sign in once via OAuth to create the user, then re-run.`);
    process.exit(1);
  }

  const user = rows[0];
  if (user.role === 'admin') {
    console.log(`User ${user.email} is already admin (id=${user.id}).`);
    process.exit(0);
  }

  await pool.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', ['admin', user.id]);
  console.log(`Promoted ${user.email} to admin (id=${user.id}).`);
  process.exit(0);
}

run()
  .catch((err) => {
    console.error('Failed to promote admin:', err?.message || err);
    process.exit(1);
  })
  .finally(async () => {
    try { await pool.end(); } catch (_) {}
  });
