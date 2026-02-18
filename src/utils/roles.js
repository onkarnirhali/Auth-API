'use strict';

function normalizeRole(value, allowed = ['admin', 'user']) {
  if (typeof value !== 'string') return null;
  const role = value.trim().toLowerCase();
  return allowed.includes(role) ? role : null;
}

module.exports = {
  normalizeRole,
};
