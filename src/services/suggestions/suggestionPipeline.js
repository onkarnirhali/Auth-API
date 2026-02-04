'use strict';

// Orchestrates end-to-end suggestion refresh: ingest Gmail -> retrieve contexts -> generate -> persist

const aiSuggestions = require('../../models/aiSuggestionModel');
const { ingestNewEmailsForUser } = require('../gmail/ingestionService');
const { ingestNewOutlookEmails } = require('../outlook/ingestionService');
const { getRelevantEmailContexts } = require('./retrievalService');
const { generateSuggestionsFromContextsWithUsage } = require('../ai/suggestionGenerator');
const { logEventSafe } = require('../eventService');
const { logGenerationUsage } = require('../ai/tokenUsageService');

async function refreshSuggestionsForUser(userId, options = {}) {
  if (!userId) throw new Error('userId is required to refresh suggestions');

  const ingestResult = { gmail: null, outlook: null };

  try {
    ingestResult.gmail = await ingestNewEmailsForUser(userId, {
      maxMessages: options.maxMessages,
    });
  } catch (err) {
    console.error('Failed Gmail ingest for suggestions', { userId, error: err?.message });
  }

  try {
    ingestResult.outlook = await ingestNewOutlookEmails(userId);
  } catch (err) {
    // Skip if user not linked or tokens missing
    if (process.env.NODE_ENV !== 'test') {
      console.error('Failed Outlook ingest for suggestions', { userId, error: err?.message });
    }
  }

  const contexts = await getRelevantEmailContexts(userId);
  if (!contexts || contexts.length === 0) {
    // Clear old suggestions if nothing to use
    await aiSuggestions.replaceForUser(userId, []);
    return { ingested: ingestResult, suggestions: [], contexts: [] };
  }

  const generatedResult = await generateSuggestionsFromContextsWithUsage(contexts);
  const stored = await aiSuggestions.replaceForUser(userId, generatedResult.suggestions);
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
