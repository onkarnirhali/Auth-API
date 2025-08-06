// src/config/db.js
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DB_URL });

pool.connect()
  .then(() => console.log('Connected to PostgreSQL'))
  .catch(err => console.error('DB connection error', err));

module.exports = pool;