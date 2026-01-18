'use strict';

const { google } = require('googleapis');
const gmailTokens = require('../../models/gmailTokenModel');

function buildOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALLBACK_URL || process.env.GOOGLE_CALLBACK_URL_PROD;
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth client credentials are missing');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function getAuthorizedGmail(userId) {
  if (!userId) throw new Error('userId required for Gmail client');
  const token = await gmailTokens.findByUserId(userId);
  if (!token) throw new Error('No Gmail tokens found for user');
  if (!token.refreshToken) {
    throw new Error('Refresh token missing; request Google OAuth consent with offline access');
  }

  const oauth2Client = buildOAuthClient();
  const expiryMs = token.expiresAt ? new Date(token.expiresAt).getTime() : null;
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    token_type: token.tokenType || 'Bearer',
    expiry_date: expiryMs || null,
    scope: token.scope,
  });

  // Persist refreshed tokens automatically
  // Persist refreshed tokens from Google as they arrive (access + refresh)
  oauth2Client.on('tokens', async (tokens) => {
    try {
      if (!tokens?.access_token && !tokens?.refresh_token) return;
      await gmailTokens.upsertToken({
        userId,
        accessToken: tokens.access_token || token.accessToken,
        refreshToken: tokens.refresh_token || token.refreshToken,
        tokenType: tokens.token_type || token.tokenType || 'Bearer',
        scope: tokens.scope || token.scope,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : token.expiresAt,
      });
    } catch (err) {
      console.error('Failed to persist refreshed Gmail tokens', err);
    }
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  return { gmail, token };
}

module.exports = {
  getAuthorizedGmail,
};
