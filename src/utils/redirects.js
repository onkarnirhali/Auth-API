'use strict';

function getAllowedRedirectBase() {
  const allowed = (process.env.ALLOWED_REDIRECTS || process.env.FRONTEND_URL || process.env.CORS_ORIGIN || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return allowed[0] || null;
}

module.exports = {
  getAllowedRedirectBase,
};
