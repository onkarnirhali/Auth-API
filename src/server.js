// src/server.js
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const express = require('express');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const authRoutes = require('./routes/authRoutes');
const todoRoutes = require('./routes/todoRoutes');
require('./config/db');
require('./config/passport');


const app = express();
// When behind a reverse proxy (e.g., Nginx/ALB) trust X-Forwarded-* headers
app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
  credentials: true,
}));

// Attach a request id (uses incoming X-Request-Id if provided)
app.use((req, res, next) => {
  try {
    const { randomUUID } = require('crypto');
    const reqId = req.headers['x-request-id'] || randomUUID();
    req.id = String(reqId);
    res.setHeader('X-Request-Id', req.id);
  } catch (_) {}
  next();
});

// Minimal request logger for debugging routes
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const ip = req.ip || req.connection?.remoteAddress || '-';
    const id = req.id ? `[${req.id}] ` : '';
    console.log(`${id}${req.method} ${req.originalUrl} <- ${ip} -> ${res.statusCode} ${ms}ms`);
  });
  next();
});

// URL guard: if trailing spaces (or %20) exist, 308-redirect to trimmed URL
app.use((req, res, next) => {
  const url = req.url;
  const qIdx = url.indexOf('?');
  const path = qIdx === -1 ? url : url.slice(0, qIdx);
  const query = qIdx === -1 ? '' : url.slice(qIdx);
  if (/(?:%20|\s)+$/.test(path)) {
    const trimmed = path.replace(/(?:%20|\s)+$/g, '');
    const location = trimmed + query;
    return res.redirect(308, location);
  }
  next();
});

// Optional HTTPS redirect in production (when behind proxy)
app.use((req, res, next) => {
  const redirectDisabled = process.env.DISABLE_HTTPS_REDIRECT === '1' || process.env.DISABLE_HTTPS_REDIRECT === 'true';
  if (process.env.NODE_ENV === 'production' && !redirectDisabled && !req.secure) {
    // Respect X-Forwarded-Proto from proxy
    const proto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0];
    if (proto !== 'https') {
      const host = req.headers.host;
      return res.redirect(308, `https://${host}${req.originalUrl}`);
    }
  }
  next();
});

// Initialize passport
app.use(passport.initialize());

// Routes
app.use('/auth', require('./routes/authRoutes'));
app.use('/api/todos', todoRoutes);

// Liveness/Readiness
app.get('/healthz', async (req, res) => {
  try {
    const pool = require('./config/db');
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(503).json({ ok: false, error: 'DB not ready' });
  }
});

// 404 handler (standardized)
app.use((req, res, next) => {
  res.status(404).json({ error: { message: 'Not Found' }, requestId: req.id });
});

// Error handler (standardized)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const code = err.code || undefined;
  const message = err.expose ? err.message : (err.message || 'Internal Server Error');
  res.status(status).json({ error: { message, code }, requestId: req.id });
});

// Graceful shutdown
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

function shutdown(signal) {
  console.log(`\n${signal} received, shutting down gracefully...`);
  server.close(async () => {
    try {
      const pool = require('./config/db');
      await pool.end();
    } catch (_) {}
    process.exit(0);
  });
  // Force exit if not closed in time
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
