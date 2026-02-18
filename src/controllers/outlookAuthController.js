'use strict';

const outlookTokens = require('../models/outlookTokenModel');
const { logEventSafe } = require('../services/eventService');
const { connectProviderPolicy } = require('../services/providerConnection/providerConnectionService');
const { buildAuthorizeUrl, verifyState, exchangeCodeForToken, decodeIdToken } = require('../services/outlook/oauthService');
const { setAuthCookies, generateAccessToken, generateRefreshToken, storeRefreshToken } = require('../services/tokenService');
const users = require('../models/userModel');
const { getAllowedRedirectBase } = require('../utils/redirects');

async function start(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const url = buildAuthorizeUrl(req.user.id);
    return res.redirect(url);
  } catch (err) {
    return next(err);
  }
}

async function callback(req, res, next) {
  try {
    const { code, state, error, error_description: description } = req.query;
    if (error) {
      const msg = description || error || 'Outlook authorization failed';
      return res.status(400).json({ error: { message: msg } });
    }
    if (!code) return res.status(400).json({ error: 'Missing authorization code' });
    if (!state) return res.status(400).json({ error: 'Missing state' });

    let decoded;
    try {
      decoded = verifyState(state);
    } catch (_) {
      return res.status(400).json({ error: 'Invalid state' });
    }
    const userId = decoded?.uid;
    if (!userId) return res.status(400).json({ error: 'Invalid state' });

    const tokenData = await exchangeCodeForToken(code);
    const idTokenPayload = decodeIdToken(tokenData.id_token);
    const accountEmail = idTokenPayload?.preferred_username || idTokenPayload?.email || null;
    const tenantId = idTokenPayload?.tid || tokenData.tenant || null;
    const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null;

    await outlookTokens.upsertToken({
      userId,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
      expiresAt,
      tenantId,
      accountEmail,
    });

    await connectProviderPolicy(userId, 'outlook', {
      lastLinkedAt: new Date(),
      metadata: { tenantId, accountEmail },
    });
    await logEventSafe({
      type: 'provider.connected',
      userId,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      source: 'oauth',
      metadata: {
        provider: 'outlook',
        ingestEnabled: true,
      },
    });

    // Ensure user session cookies still present; if not, issue fresh based on existing user
    let user = req.user;
    if (!user) {
      user = await users.findById(userId);
      if (user) {
        const accessToken = generateAccessToken(user.id);
        const refreshToken = generateRefreshToken();
        await storeRefreshToken({ userId: user.id, token: refreshToken, userAgent: req.get('user-agent'), ip: req.ip });
        setAuthCookies(res, { accessToken, refreshToken });
      }
    }

    const frontend = getAllowedRedirectBase();
    const redirectPath = process.env.LOGIN_SUCCESS_REDIRECT_PATH || '/app';
    if (frontend) {
      return res.redirect(302, `${frontend}${redirectPath}?outlook=connected`);
    }
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  start,
  callback,
};
