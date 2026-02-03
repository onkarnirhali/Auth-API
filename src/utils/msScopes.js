'use strict';

// Parse MS_GRAPH_SCOPES env or fallback to required defaults

const DEFAULT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Calendars.Read',
];

function parseScopes(raw) {
  if (!raw) return DEFAULT_SCOPES;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return String(raw)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getMsScopes() {
  return parseScopes(process.env.MS_GRAPH_SCOPES || process.env.MS_SCOPES);
}

module.exports = {
  getMsScopes,
  DEFAULT_SCOPES,
};
