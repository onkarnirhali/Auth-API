'use strict';

// Orchestrates end-to-end suggestion refresh:
// provider policy -> gated ingest -> retrieval -> generation -> task-history fallback -> merged persistence.

const aiSuggestions = require('../../models/aiSuggestionModel');
const { ingestNewEmailsForUser } = require('../gmail/ingestionService');
const { ingestNewOutlookEmails } = require('../outlook/ingestionService');
const { getRelevantEmailContexts } = require('./retrievalService');
const { generateSuggestionsFromContextsWithUsage } = require('../ai/suggestionGenerator');
const { enrichSuggestionsWithSource } = require('./suggestionSource');
const { mergeSuggestions } = require('./suggestionMergeService');
const { generateTaskHistorySuggestions } = require('./taskHistorySuggestionService');
const { resolveSuggestionEligibility } = require('./suggestionEligibilityService');
const { logEventSafe } = require('../eventService');
const { logGenerationUsage } = require('../ai/tokenUsageService');

async function ingestAllowedProviders(userId, options, allowedProviders) {
  const ingestResult = { gmail: null, outlook: null };
  const allowed = new Set(allowedProviders || []);

  if (allowed.has('gmail')) {
    try {
      ingestResult.gmail = await ingestNewEmailsForUser(userId, {
        maxMessages: options.maxMessages,
      });
    } catch (err) {
      console.error('Failed Gmail ingest for suggestions', { userId, error: err?.message });
    }
  }

  if (allowed.has('outlook')) {
    try {
      ingestResult.outlook = await ingestNewOutlookEmails(userId);
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        console.error('Failed Outlook ingest for suggestions', { userId, error: err?.message });
      }
    }
  }

  return ingestResult;
}

async function refreshSuggestionsForUser(userId, options = {}) {
  if (!userId) throw new Error('userId is required to refresh suggestions');

  const taskHistory = await generateTaskHistorySuggestions(userId);
  const { matrix, eligibility } = await resolveSuggestionEligibility(userId, {
    historyReady: taskHistory.historyReady,
  });

  const ingestResult = await ingestAllowedProviders(userId, options, eligibility.allowedEmailProviders);

  let contexts = [];
  let emailSuggestions = [];
  let usage = null;
  let provider = null;
  let model = null;

  if (eligibility.allowedEmailProviders.length > 0) {
    contexts = await getRelevantEmailContexts(userId, {
      allowedProviders: eligibility.allowedEmailProviders,
    });
    if (contexts.length > 0) {
      const generated = await generateSuggestionsFromContextsWithUsage(contexts);
      emailSuggestions = generated.suggestions || [];
      usage = generated.usage || null;
      provider = generated.provider || null;
      model = generated.model || null;
    }
  }

  if (usage) {
    await logGenerationUsage({
      userId,
      requestId: options.requestId || null,
      ipAddress: options.ipAddress || null,
      userAgent: options.userAgent || null,
      source: options.source || 'ai',
      usage,
      provider,
      model,
      purpose: 'suggestions',
    });
  }

  const historySuggestions = eligibility.allowTaskHistory ? taskHistory.suggestions : [];
  const mergedSuggestions = mergeSuggestions({
    emailSuggestions,
    historySuggestions,
  });
  const sourceEnriched = enrichSuggestionsWithSource(mergedSuggestions, contexts);
  const stored = await aiSuggestions.replaceForUser(userId, sourceEnriched);

  const reasonCode = stored.length === 0 ? eligibility.reasonCode : undefined;
  const context = {
    mode: eligibility.mode,
    ...(reasonCode ? { reasonCode } : {}),
  };

  await logEventSafe({
    type: 'ai.suggestions.generated',
    userId,
    requestId: options.requestId || null,
    ipAddress: options.ipAddress || null,
    userAgent: options.userAgent || null,
    source: options.source || 'ai',
    metadata: {
      mode: context.mode,
      reasonCode: context.reasonCode || null,
      suggestionsCount: stored.length,
      contextsUsed: contexts.length,
      taskHistoryCount: historySuggestions.length,
      providersIngested: Object.keys(ingestResult || {}).filter((key) => !!ingestResult[key]),
      providerMatrix: matrix,
    },
  });

  return {
    ingested: ingestResult,
    suggestions: stored,
    contexts,
    context,
  };
}

module.exports = {
  refreshSuggestionsForUser,
};
