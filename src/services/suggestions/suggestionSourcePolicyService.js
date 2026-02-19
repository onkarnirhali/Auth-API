'use strict';

const providerLinks = require('../../models/providerLinkModel');
const gmailTokens = require('../../models/gmailTokenModel');
const outlookTokens = require('../../models/outlookTokenModel');

function isLinkIngestEnabled(links, provider) {
  const link = (links || []).find((entry) => String(entry?.provider || '').toLowerCase() === provider);
  if (!link) return null;
  return Boolean(link.linked && link.ingestEnabled);
}

function buildMode(gmailEnabled, outlookEnabled) {
  if (gmailEnabled && outlookEnabled) return 'both';
  if (gmailEnabled) return 'gmail_only';
  if (outlookEnabled) return 'outlook_only';
  return 'none';
}

function buildAllowedProviders(gmailEnabled, outlookEnabled) {
  const providers = [];
  if (gmailEnabled) providers.push('gmail');
  if (outlookEnabled) providers.push('outlook');
  return providers;
}

function buildSuggestionContext({ mode, hasSuggestions, historyReady }) {
  const context = { mode: mode || 'none' };
  if (hasSuggestions) return context;

  if (mode === 'none') {
    context.reasonCode = historyReady ? 'NO_PROVIDER_CONNECTED' : 'INSUFFICIENT_HISTORY';
  }

  return context;
}

async function resolveSuggestionSourcePolicy(userId) {
  const links = await providerLinks.listByUser(userId);
  const gmailFromLink = isLinkIngestEnabled(links, 'gmail');
  const outlookFromLink = isLinkIngestEnabled(links, 'outlook');

  const [gmailToken, outlookToken] = await Promise.all([
    gmailFromLink === null ? gmailTokens.findByUserId(userId).catch(() => null) : Promise.resolve(null),
    outlookFromLink === null ? outlookTokens.findByUserId(userId).catch(() => null) : Promise.resolve(null),
  ]);

  const gmailEnabled = gmailFromLink !== null ? gmailFromLink : Boolean(gmailToken);
  const outlookEnabled = outlookFromLink !== null ? outlookFromLink : Boolean(outlookToken);
  const mode = buildMode(gmailEnabled, outlookEnabled);
  const allowedEmailProviders = buildAllowedProviders(gmailEnabled, outlookEnabled);

  return {
    gmailEnabled,
    outlookEnabled,
    allowedEmailProviders,
    mode,
  };
}

module.exports = {
  buildMode,
  buildSuggestionContext,
  resolveSuggestionSourcePolicy,
};
