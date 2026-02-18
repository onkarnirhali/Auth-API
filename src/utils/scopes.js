'use strict';

// Shared scope parsing + normalization helpers for OAuth providers

const DEFAULT_MS_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Calendars.Read',
];

function parseScopes(raw, fallback = []) {
  if (!raw) {
    return Array.isArray(fallback) ? fallback : [];
  }
  if (Array.isArray(raw)) {
    return raw.filter(Boolean);
  }
  return String(raw)
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function normalizeScope(scope) {
  if (!scope) return null;
  if (Array.isArray(scope)) return scope.join(' ');
  return scope;
}

function getGoogleScopes() {
  return parseScopes(process.env.GOOGLE_OAUTH_SCOPES, ['profile', 'email']);
}

function getMsScopes() {
  return parseScopes(process.env.MS_GRAPH_SCOPES || process.env.MS_SCOPES, DEFAULT_MS_SCOPES);
}

module.exports = {
  DEFAULT_MS_SCOPES,
  parseScopes,
  normalizeScope,
  getGoogleScopes,
  getMsScopes,
};
