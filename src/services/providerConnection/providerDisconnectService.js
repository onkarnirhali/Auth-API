'use strict';

const gmailTokens = require('../../models/gmailTokenModel');
const outlookTokens = require('../../models/outlookTokenModel');
const { logEventSafe } = require('../eventService');
const {
  normalizeProvider,
  disconnectProviderPolicy,
} = require('./providerConnectionService');
const logger = require('../../utils/logger');

function extractErrorSignals(err) {
  const lowered = [];
  const push = (value) => {
    if (typeof value !== 'string') return;
    const text = value.trim().toLowerCase();
    if (text) lowered.push(text);
  };

  if (!err) return lowered;
  if (typeof err === 'string') {
    push(err);
    return lowered;
  }

  push(err.message);
  push(err.code);
  push(err.statusText);
  push(err.error);
  push(err.error_description);

  const response = err.response || null;
  if (response) {
    push(response.statusText);
    push(response.data?.error);
    push(response.data?.error_description);
    push(response.data?.error?.code);
    push(response.data?.error?.message);
  }

  return lowered;
}

function isInvalidGrantError(err) {
  return extractErrorSignals(err).some((value) => value.includes('invalid_grant'));
}

async function removeProviderTokens(userId, provider) {
  if (provider === 'gmail') {
    await gmailTokens.removeByUserId(userId);
    return;
  }
  if (provider === 'outlook') {
    await outlookTokens.removeByUserId(userId);
  }
}

function buildDisconnectMetadata(options = {}) {
  if (!options.markReconnectRequired) {
    return { clearReconnectMetadata: true, metadata: {} };
  }
  return {
    clearReconnectMetadata: false,
    metadata: {
      reconnectRequired: true,
      reconnectReason: options.reason || 'invalid_grant',
      reconnectRequiredAt: new Date().toISOString(),
    },
  };
}

async function disconnectProviderForUser(userId, provider, options = {}) {
  if (!userId) throw new Error('userId is required to disconnect provider');
  const normalized = normalizeProvider(provider);

  try {
    await removeProviderTokens(userId, normalized);
  } catch (err) {
    logger.error('Failed to remove provider tokens during disconnect', {
      userId,
      provider: normalized,
      error: err?.message || 'unknown',
    });
  }

  const metadataOptions = buildDisconnectMetadata(options);
  const updated = await disconnectProviderPolicy(userId, normalized, metadataOptions);

  await logEventSafe({
    type: 'provider.disconnected',
    userId,
    requestId: options.requestId || null,
    ipAddress: options.ipAddress || null,
    userAgent: options.userAgent || null,
    source: options.source || 'api',
    metadata: {
      provider: normalized,
      ingestEnabled: updated.ingestEnabled,
      automatic: Boolean(options.automatic),
      reason: options.reason || null,
      reconnectRequired: Boolean(options.markReconnectRequired),
    },
  });

  return updated;
}

module.exports = {
  isInvalidGrantError,
  disconnectProviderForUser,
};
