'use strict';

const isString = (v) => typeof v === 'string';
const isNonEmpty = (s) => isString(s) && s.trim().length > 0;
const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

function parsePasswordProtection(raw, errors, pathPrefix = 'passwordProtection') {
  if (raw === undefined) return undefined;
  if (!isObject(raw)) {
    errors.push({ path: pathPrefix, message: 'must be an object' });
    return undefined;
  }

  const enabled = raw.enabled;
  if (typeof enabled !== 'boolean') {
    errors.push({ path: `${pathPrefix}.enabled`, message: 'must be boolean' });
    return undefined;
  }

  const out = { enabled };
  if (enabled) {
    if (!isString(raw.password)) errors.push({ path: `${pathPrefix}.password`, message: 'must be string' });
    else if (raw.password.length < 6) errors.push({ path: `${pathPrefix}.password`, message: 'must be at least 6 chars' });
    else out.password = raw.password;
  } else if (raw.currentPassword !== undefined) {
    if (!isString(raw.currentPassword) || !raw.currentPassword.length) {
      errors.push({ path: `${pathPrefix}.currentPassword`, message: 'must be non-empty string' });
    } else {
      out.currentPassword = raw.currentPassword;
    }
  }

  return out;
}

function validateCreate(req) {
  const b = req.body || {};
  const errors = [];

  if (!isNonEmpty(b.title)) errors.push({ path: 'title', message: 'title is required (1-200 chars)' });
  if (isString(b.title) && b.title.length > 200) errors.push({ path: 'title', message: 'max length 200' });
  if (!isObject(b.content)) errors.push({ path: 'content', message: 'content must be object JSON' });

  const passwordProtection = parsePasswordProtection(b.passwordProtection, errors);
  const value = {
    body: {
      title: b.title,
      content: b.content,
      ...(passwordProtection !== undefined ? { passwordProtection } : {}),
    },
  };

  return { errors, value };
}

function validateUpdate(req) {
  const b = req.body || {};
  const errors = [];
  const out = {};

  if (b.title !== undefined) {
    if (!isNonEmpty(b.title)) errors.push({ path: 'title', message: 'title must be non-empty string (1-200 chars)' });
    if (isString(b.title) && b.title.length > 200) errors.push({ path: 'title', message: 'max length 200' });
    out.title = b.title;
  }

  if (b.content !== undefined) {
    if (!isObject(b.content)) errors.push({ path: 'content', message: 'content must be object JSON' });
    out.content = b.content;
  }

  if (b.passwordProtection !== undefined) {
    const parsed = parsePasswordProtection(b.passwordProtection, errors);
    if (parsed !== undefined) out.passwordProtection = parsed;
  }

  if (!Object.keys(out).length) errors.push({ path: 'body', message: 'at least one updatable field is required' });

  return { errors, value: { body: out } };
}

function validateOpen(req) {
  const b = req.body || {};
  const errors = [];
  if (!isString(b.password) || !b.password.length) {
    errors.push({ path: 'password', message: 'password is required' });
  }
  return { errors, value: { body: { password: b.password } } };
}

function validateListQuery(req) {
  const q = req.query || {};
  const errors = [];
  const out = {};
  if (q.q !== undefined) {
    if (!isString(q.q)) errors.push({ path: 'q', message: 'must be string' });
    else out.q = q.q;
  }
  if (q.limit !== undefined) {
    const n = Number(q.limit);
    if (!Number.isFinite(n) || n <= 0) errors.push({ path: 'limit', message: 'must be a positive number' });
    else out.limit = n;
  }
  if (q.offset !== undefined) {
    const n = Number(q.offset);
    if (!Number.isFinite(n) || n < 0) errors.push({ path: 'offset', message: 'must be a non-negative number' });
    else out.offset = n;
  }
  return { errors, value: { query: out } };
}

function validatePreferences(req) {
  const b = req.body || {};
  const errors = [];
  if (!['list', 'grid'].includes(b.viewMode)) {
    errors.push({ path: 'viewMode', message: 'must be list or grid' });
  }
  return { errors, value: { body: { viewMode: b.viewMode } } };
}

module.exports = {
  validateCreate,
  validateUpdate,
  validateOpen,
  validateListQuery,
  validatePreferences,
};

