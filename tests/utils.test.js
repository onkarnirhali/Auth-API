'use strict';

const {
  parseScopes,
  normalizeScope,
  getGoogleScopes,
  getMsScopes,
  DEFAULT_MS_SCOPES,
} = require('../src/utils/scopes');
const { parsePagination } = require('../src/utils/pagination');
const { normalizeRole } = require('../src/utils/roles');
const { getAllowedRedirectBase } = require('../src/utils/redirects');

const ORIGINAL_ENV = { ...process.env };

describe('utils helpers', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('parseScopes uses fallback when raw missing', () => {
    expect(parseScopes(null, ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('parseScopes splits strings by comma or whitespace', () => {
    expect(parseScopes('a b, c,,', ['x'])).toEqual(['a', 'b', 'c']);
  });

  it('normalizeScope joins arrays and returns null for empty', () => {
    expect(normalizeScope(['a', 'b'])).toBe('a b');
    expect(normalizeScope('scope')).toBe('scope');
    expect(normalizeScope('')).toBeNull();
  });

  it('getGoogleScopes respects env override', () => {
    process.env.GOOGLE_OAUTH_SCOPES = 'openid email';
    expect(getGoogleScopes()).toEqual(['openid', 'email']);
  });

  it('getMsScopes falls back to default scopes', () => {
    delete process.env.MS_GRAPH_SCOPES;
    delete process.env.MS_SCOPES;
    expect(getMsScopes()).toEqual(DEFAULT_MS_SCOPES);
  });

  it('parsePagination preserves limits and offsets', () => {
    expect(parsePagination({ limit: '10', offset: '7' })).toEqual({ limit: 10, offset: 7 });
    expect(parsePagination({ limit: '0', offset: '-5' })).toEqual({ limit: 25, offset: 0 });
  });

  it('normalizeRole only allows known roles', () => {
    expect(normalizeRole('Admin')).toBe('admin');
    expect(normalizeRole('user')).toBe('user');
    expect(normalizeRole('other')).toBeNull();
  });

  it('getAllowedRedirectBase reads allowlist envs in order', () => {
    process.env.ALLOWED_REDIRECTS = 'https://a.example.com, https://b.example.com';
    process.env.FRONTEND_URL = 'https://front.example.com';
    process.env.CORS_ORIGIN = 'https://cors.example.com';
    expect(getAllowedRedirectBase()).toBe('https://a.example.com');
  });

  it('getAllowedRedirectBase falls back when allowlist missing', () => {
    delete process.env.ALLOWED_REDIRECTS;
    process.env.FRONTEND_URL = 'https://front.example.com';
    expect(getAllowedRedirectBase()).toBe('https://front.example.com');
  });
});
