'use strict';

const axios = require('axios');
const jwt = require('jsonwebtoken');
const { getMsScopes } = require('../../utils/msScopes');

const AUTH_URL = 'https://login.microsoftonline.com';

function getTenant() {
  return process.env.MS_TENANT || 'common';
}

function getClientConfig() {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  const redirectUri = process.env.MS_REDIRECT_URI || process.env.MS_CALLBACK_URL;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('MS_CLIENT_ID, MS_CLIENT_SECRET, and MS_REDIRECT_URI are required for Outlook OAuth');
  }
  return { clientId, clientSecret, redirectUri };
}

function buildState(userId) {
  const secret = process.env.JWT_SECRET;
  const payload = { uid: userId, nonce: Math.random().toString(36).slice(2) };
  return jwt.sign(payload, secret, { expiresIn: '10m' });
}

function verifyState(state) {
  if (!state) throw new Error('Missing state');
  const secret = process.env.JWT_SECRET;
  return jwt.verify(state, secret);
}

function buildAuthorizeUrl(userId) {
  const { clientId, redirectUri } = getClientConfig();
  const state = buildState(userId);
  const scopes = getMsScopes().join(' ');
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: scopes,
    state,
    prompt: 'select_account',
  });
  return `${AUTH_URL}/${getTenant()}/oauth2/v2.0/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const { clientId, clientSecret, redirectUri } = getClientConfig();
  const scopes = getMsScopes().join(' ');
  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    client_secret: clientSecret,
  });
  const tokenUrl = `${AUTH_URL}/${getTenant()}/oauth2/v2.0/token`;
  const { data } = await axios.post(tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return data;
}

async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret, redirectUri } = getClientConfig();
  const scopes = getMsScopes().join(' ');
  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    refresh_token: refreshToken,
    redirect_uri: redirectUri,
    grant_type: 'refresh_token',
    client_secret: clientSecret,
  });
  const tokenUrl = `${AUTH_URL}/${getTenant()}/oauth2/v2.0/token`;
  const { data } = await axios.post(tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return data;
}

function decodeIdToken(idToken) {
  try {
    return jwt.decode(idToken) || {};
  } catch (_) {
    return {};
  }
}

module.exports = {
  buildAuthorizeUrl,
  verifyState,
  exchangeCodeForToken,
  refreshAccessToken,
  decodeIdToken,
};
