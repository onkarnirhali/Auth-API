'use strict';

const { logEventSafe } = require('../eventService');

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function canLogUsage(usage) {
  return isNumber(usage?.totalTokens);
}

function buildMetadata({ usage, provider, model, purpose }) {
  return {
    provider: provider || null,
    model: model || null,
    purpose: purpose || null,
    promptTokens: isNumber(usage?.promptTokens) ? usage.promptTokens : null,
    completionTokens: isNumber(usage?.completionTokens) ? usage.completionTokens : null,
    totalTokens: isNumber(usage?.totalTokens) ? usage.totalTokens : null,
  };
}

async function logGenerationUsage({ userId, requestId, ipAddress, userAgent, source, usage, provider, model, purpose }) {
  if (!canLogUsage(usage)) return null;
  return logEventSafe({
    type: 'ai.tokens.generation',
    userId,
    requestId,
    ipAddress,
    userAgent,
    source: source || 'ai',
    metadata: buildMetadata({ usage, provider, model, purpose }),
  });
}

async function logEmbeddingUsage({ userId, requestId, ipAddress, userAgent, source, usage, provider, model, purpose }) {
  if (!canLogUsage(usage)) return null;
  return logEventSafe({
    type: 'ai.tokens.embedding',
    userId,
    requestId,
    ipAddress,
    userAgent,
    source: source || 'ai',
    metadata: buildMetadata({ usage, provider, model, purpose }),
  });
}

module.exports = {
  logGenerationUsage,
  logEmbeddingUsage,
};
