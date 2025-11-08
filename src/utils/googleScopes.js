'use strict';

function parseScopes(raw) {
  if (!raw) {
    return ['profile', 'email'];
  }
  if (Array.isArray(raw)) {
    return raw.filter(Boolean);
  }
  return String(raw)
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function getGoogleScopes() {
  return parseScopes(process.env.GOOGLE_OAUTH_SCOPES);
}

module.exports = {
  getGoogleScopes,
};
