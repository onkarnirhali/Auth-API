'use strict';

const { getMsScopes, DEFAULT_MS_SCOPES } = require('./scopes');

// Preserve existing export name for backward compatibility
const DEFAULT_SCOPES = DEFAULT_MS_SCOPES;

module.exports = {
  getMsScopes,
  DEFAULT_SCOPES,
};
