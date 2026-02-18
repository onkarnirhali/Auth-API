'use strict';

// Orchestrates end-to-end suggestion refresh: ingest Gmail -> retrieve contexts -> generate -> persist

const aiSuggestions = require('../../models/aiSuggestionModel');
const providerLinks = require('../../models/providerLinkModel');
const gmailTokens = require('../../models/gmailTokenModel');
const outlookTokens = require('../../models/outlookTokenModel');
const { ingestNewEmailsForUser } = require('../gmail/ingestionService');
const { ingestNewOutlookEmails } = require('../outlook/ingestionService');
const { getRelevantEmailContexts } = require('./retrievalService');
const { generateSuggestionsFromContextsWithUsage } = require('../ai/suggestionGenerator');
const { enrichSuggestionsWithSource } = require('./suggestionSource');
const { logEventSafe } = require('../eventService');
const { logGenerationUsage } = require('../ai/tokenUsageService');

function isLinkIngestEnabled(links, provider) {
  const link = (links || []).find((entry) => entry.provider === provider);
  if (!link) return null;
  return Boolean(link.linked && link.ingestEnabled);
}

async function resolveProviderIngestState(userId) {
  const links = await providerLinks.listByUser(userId);

  const gmailFromLink = isLinkIngestEnabled(links, 'gmail');
  const outlookFromLink = isLinkIngestEnabled(links, 'outlook');

  const gmailEnabled = gmailFromLink !== null
    ? gmailFromLink
    : Boolean(await gmailTokens.findByUserId(userId));
  const outlookEnabled = outlookFromLink !== null
    ? outlookFromLink
    : Boolean(await outlookTokens.findByUserId(userId));

  return { gmailEnabled, outlookEnabled };
}

async function refreshSuggestionsForUser(userId, options = {}) {
  if (!userId) throw new Error('userId is required to refresh suggestions');

  const ingestResult = { gmail: null, outlook: null };
  const ingestState = await resolveProviderIngestState(userId);

  if (ingestState.gmailEnabled) {
    try {
      ingestResult.gmail = await ingestNewEmailsForUser(userId, {
        maxMessages: options.maxMessages,
      });
    } catch (err) {
      console.error('Failed Gmail ingest for suggestions', { userId, error: err?.message });
    }
  }

  if (ingestState.outlookEnabled) {
    try {
      ingestResult.outlook = await ingestNewOutlookEmails(userId);
    } catch (err) {
      // Skip if user not linked or tokens missing
      if (process.env.NODE_ENV !== 'test') {
        console.error('Failed Outlook ingest for suggestions', { userId, error: err?.message });
      }
    }
  }

  const contexts = await getRelevantEmailContexts(userId);
  if (!contexts || contexts.length === 0) {
    // Clear old suggestions if nothing to use
    await aiSuggestions.replaceForUser(userId, []);
    return { ingested: ingestResult, suggestions: [], contexts: [] };
  }

  const generatedResult = await generateSuggestionsFromContextsWithUsage(contexts);
  const sourceEnrichedSuggestions = enrichSuggestionsWithSource(generatedResult.suggestions, contexts);
  const stored = await aiSuggestions.replaceForUser(userId, sourceEnrichedSuggestions);
  await logGenerationUsage({
    userId,
    requestId: options.requestId || null,
    ipAddress: options.ipAddress || null,
    userAgent: options.userAgent || null,
    source: options.source || 'ai',
    usage: generatedResult.usage,
    provider: generatedResult.provider,
    model: generatedResult.model,
    purpose: 'suggestions',
  });
  await logEventSafe({
    type: 'ai.suggestions.generated',
    userId,
    requestId: options.requestId || null,
    ipAddress: options.ipAddress || null,
    userAgent: options.userAgent || null,
    source: options.source || 'ai',
    metadata: {
      suggestionsCount: stored.length,
      contextsUsed: contexts.length,
      providersIngested: Object.keys(ingestResult || {}).filter((k) => !!ingestResult[k]),
    },
  });
  return {
    ingested: ingestResult,
    suggestions: stored,
    contexts,
  };
}

module.exports = {
  refreshSuggestionsForUser,
};
