// src/config/db.js
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DB_URL });

// Eagerly test connection on startup; reuse shared pool across modules
pool.connect()
  .then(() => console.log('Connected to PostgreSQL'))
  .catch(err => console.error('DB connection error', err));

module.exports = pool;
