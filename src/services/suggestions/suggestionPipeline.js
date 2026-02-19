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
const { resolveSuggestionSourcePolicy, buildSuggestionContext } = require('./suggestionSourcePolicyService');
const { disconnectProviderForUser, isInvalidGrantError } = require('../providerConnection/providerDisconnectService');
const { logEventSafe } = require('../eventService');
const { logGenerationUsage } = require('../ai/tokenUsageService');
const { AiProviderError } = require('../ai/errors');
const logger = require('../../utils/logger');

const MANUAL_CATCHUP_MAX_MESSAGES = Number(process.env.AI_MANUAL_CATCHUP_MAX_MESSAGES || 50) || 50;
const MANUAL_CATCHUP_LOCK_TTL_MS = Number(process.env.AI_MANUAL_CATCHUP_LOCK_TTL_MS || 600000) || 600000;
const manualCatchUpLocks = new Map();

function parsePositiveInt(value, fallback, hardMax) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  const floored = Math.floor(parsed);
  return Number.isFinite(hardMax) && hardMax > 0 ? Math.min(floored, hardMax) : floored;
}

function buildDeadlineAt(timeBudgetMs) {
  const budget = Number(timeBudgetMs);
  if (!Number.isFinite(budget) || budget <= 0) return null;
  return Date.now() + Math.floor(budget);
}

function summarizeIngestOutcome(ingestResult) {
  const providers = Object.values(ingestResult || {}).filter(Boolean);
  const processedMessages = providers.reduce((sum, entry) => {
    const count = Number(entry?.processedMessages || 0);
    return sum + (Number.isFinite(count) ? count : 0);
  }, 0);

  const hasTimeBudgetLimit = providers.some((entry) => entry?.truncatedReason === 'TIME_BUDGET');
  const hasManualCapLimit = providers.some((entry) => entry?.truncatedReason === 'MANUAL_CAP');
  const limitedBy = hasTimeBudgetLimit ? 'TIME_BUDGET' : (hasManualCapLimit ? 'MANUAL_CAP' : undefined);

  return {
    partial: Boolean(limitedBy),
    limitedBy,
    processedMessages,
  };
}

function hasActiveManualCatchUpLock(userId) {
  if (!manualCatchUpLocks.has(userId)) return false;
  const startedAt = Number(manualCatchUpLocks.get(userId));
  if (!Number.isFinite(startedAt)) {
    manualCatchUpLocks.delete(userId);
    return false;
  }
  const ageMs = Date.now() - startedAt;
  if (ageMs > MANUAL_CATCHUP_LOCK_TTL_MS) {
    manualCatchUpLocks.delete(userId);
    logger.info('AI suggestion manual catch-up lock expired', {
      userId,
      ageMs,
      lockTtlMs: MANUAL_CATCHUP_LOCK_TTL_MS,
    });
    return false;
  }
  return true;
}

function scheduleManualCatchUp(userId, options = {}) {
  if (!userId) {
    return 'skipped';
  }
  if (hasActiveManualCatchUpLock(userId)) {
    return 'already_running';
  }
  manualCatchUpLocks.set(userId, Date.now());

  const maxMessages = parsePositiveInt(options.maxMessages, MANUAL_CATCHUP_MAX_MESSAGES, MANUAL_CATCHUP_MAX_MESSAGES);
  const timer = setTimeout(async () => {
    try {
      await refreshSuggestionsForUser(userId, {
        maxMessages,
        timeBudgetMs: 0,
        refreshMode: 'background',
        requestId: options.requestId || null,
        ipAddress: options.ipAddress || null,
        userAgent: options.userAgent || null,
        source: 'manual_catchup',
        skipCatchUp: true,
      });
      logger.info('AI suggestion manual catch-up completed', {
        userId,
        requestId: options.requestId || null,
        maxMessages,
      });
    } catch (err) {
      logger.error('AI suggestion manual catch-up failed', {
        userId,
        requestId: options.requestId || null,
        error: err?.message || 'unknown',
      });
    } finally {
      manualCatchUpLocks.delete(userId);
    }
  }, 0);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  return 'scheduled';
}

function scheduleManualRefreshForUser(userId, options = {}) {
  return scheduleManualCatchUp(userId, {
    maxMessages: parsePositiveInt(options.maxMessages, MANUAL_CATCHUP_MAX_MESSAGES, MANUAL_CATCHUP_MAX_MESSAGES),
    requestId: options.requestId || null,
    ipAddress: options.ipAddress || null,
    userAgent: options.userAgent || null,
  });
}

async function handleIngestFailure(userId, provider, err, options = {}) {
  if (!isInvalidGrantError(err)) return false;
  try {
    await disconnectProviderForUser(userId, provider, {
      requestId: options.requestId || null,
      ipAddress: options.ipAddress || null,
      userAgent: options.userAgent || null,
      source: options.source || 'scheduler',
      automatic: true,
      reason: 'invalid_grant',
      markReconnectRequired: true,
    });
    logger.info('Provider auto-disconnected after invalid_grant during ingest', {
      userId,
      provider,
    });
    return true;
  } catch (disconnectErr) {
    logger.error('Failed provider auto-disconnect after invalid_grant', {
      userId,
      provider,
      error: disconnectErr?.message || 'unknown',
    });
    return false;
  }
}

async function ingestAllowedProviders(userId, options, allowedProviders) {
  const ingestResult = { gmail: null, outlook: null };
  const allowed = new Set(allowedProviders || []);
  const deadlineAt = options.deadlineAt || null;

  if (allowed.has('gmail')) {
    try {
      ingestResult.gmail = await ingestNewEmailsForUser(userId, {
        maxMessages: options.maxMessages,
        deadlineAt,
      });
    } catch (err) {
      const autoDisconnected = await handleIngestFailure(userId, 'gmail', err, options);
      console.error('Failed Gmail ingest for suggestions', { userId, error: err?.message, autoDisconnected });
    }
  }

  if (allowed.has('outlook')) {
    try {
      ingestResult.outlook = await ingestNewOutlookEmails(userId, {
        maxMessages: options.maxMessages,
        deadlineAt,
      });
    } catch (err) {
      const autoDisconnected = await handleIngestFailure(userId, 'outlook', err, options);
      if (process.env.NODE_ENV !== 'test') {
        console.error('Failed Outlook ingest for suggestions', { userId, error: err?.message, autoDisconnected });
      }
    }
  }

  return ingestResult;
}

async function refreshSuggestionsForUser(userId, options = {}) {
  if (!userId) throw new Error('userId is required to refresh suggestions');

  const startedAt = Date.now();
  const timings = {
    taskHistoryMs: 0,
    sourcePolicyMs: 0,
    ingestMs: 0,
    retrievalMs: 0,
    generationMs: 0,
    persistenceMs: 0,
    totalMs: 0,
  };

  let stageStart = Date.now();
  const taskHistory = await generateTaskHistorySuggestions(userId);
  timings.taskHistoryMs = Date.now() - stageStart;

  stageStart = Date.now();
  const sourcePolicy = await resolveSuggestionSourcePolicy(userId);
  timings.sourcePolicyMs = Date.now() - stageStart;

  stageStart = Date.now();
  const deadlineAt = buildDeadlineAt(options.timeBudgetMs);
  const ingestResult = await ingestAllowedProviders(userId, { ...options, deadlineAt }, sourcePolicy.allowedEmailProviders);
  timings.ingestMs = Date.now() - stageStart;

  let contexts = [];
  let emailSuggestions = [];
  let usage = null;
  let provider = null;
  let model = null;
  let generationFallbackUsed = false;
  let generationErrorCode = null;

  stageStart = Date.now();
  if (sourcePolicy.allowedEmailProviders.length > 0) {
    contexts = await getRelevantEmailContexts(userId, {
      allowedProviders: sourcePolicy.allowedEmailProviders,
    });
  }
  timings.retrievalMs = Date.now() - stageStart;

  stageStart = Date.now();
  if (sourcePolicy.allowedEmailProviders.length > 0) {
    if (contexts.length > 0) {
      try {
        const generated = await generateSuggestionsFromContextsWithUsage(contexts);
        emailSuggestions = generated.suggestions || [];
        usage = generated.usage || null;
        provider = generated.provider || null;
        model = generated.model || null;
      } catch (err) {
        if (err instanceof AiProviderError && err.code === 'INVALID_JSON') {
          generationFallbackUsed = true;
          generationErrorCode = 'INVALID_JSON';
          emailSuggestions = [];
          usage = null;
          provider = null;
          model = null;
          await logEventSafe({
            type: 'ai.suggestions.generation.fallback',
            userId,
            requestId: options.requestId || null,
            ipAddress: options.ipAddress || null,
            userAgent: options.userAgent || null,
            source: options.source || 'ai',
            metadata: {
              code: generationErrorCode,
              mode: sourcePolicy.mode,
              contextsUsed: contexts.length,
            },
          });
        } else {
          throw err;
        }
      }
    }
  }
  timings.generationMs = Date.now() - stageStart;

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

  const historySuggestions = taskHistory.historyReady ? taskHistory.suggestions : [];
  const mergedSuggestions = mergeSuggestions({
    emailSuggestions,
    historySuggestions,
  });

  const preserveExistingOnEmpty = typeof options.preserveExistingOnEmpty === 'boolean'
    ? options.preserveExistingOnEmpty
    : options.source === 'manual';
  let existingSuggestions = [];
  if (preserveExistingOnEmpty) {
    existingSuggestions = await aiSuggestions.listByUser(userId, {
      limit: Number(process.env.AI_SUGGESTION_PRESERVE_LIMIT || 20) || 20,
      status: 'suggested',
    });
  }

  stageStart = Date.now();
  const sourceEnriched = enrichSuggestionsWithSource(mergedSuggestions, contexts);
  let stored = [];
  let preservedExisting = false;
  if (preserveExistingOnEmpty && sourceEnriched.length === 0 && existingSuggestions.length > 0) {
    stored = existingSuggestions;
    preservedExisting = true;
  } else {
    stored = await aiSuggestions.replaceForUser(userId, sourceEnriched);
  }
  timings.persistenceMs = Date.now() - stageStart;
  timings.totalMs = Date.now() - startedAt;

  const ingestSummary = summarizeIngestOutcome(ingestResult);
  let catchUpScheduled = false;
  let scheduleState = 'skipped';
  if (
    !options.skipCatchUp
    && options.source === 'manual'
    && ingestSummary.partial
    && sourcePolicy.allowedEmailProviders.length > 0
  ) {
    scheduleState = scheduleManualCatchUp(userId, {
      maxMessages: MANUAL_CATCHUP_MAX_MESSAGES,
      requestId: options.requestId || null,
      ipAddress: options.ipAddress || null,
      userAgent: options.userAgent || null,
    });
    catchUpScheduled = scheduleState === 'scheduled';
  }

  const refresh = {
    partial: ingestSummary.partial,
    catchUpScheduled,
    scheduleState,
    processedMessages: ingestSummary.processedMessages,
    preservedExisting,
    ...(generationFallbackUsed ? { generationFallbackUsed, generationErrorCode } : {}),
    ...(ingestSummary.limitedBy ? { limitedBy: ingestSummary.limitedBy } : {}),
  };

  const context = buildSuggestionContext({
    mode: sourcePolicy.mode,
    hasSuggestions: stored.length > 0,
    historyReady: taskHistory.historyReady,
  });

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
      sourcePolicy: {
        mode: sourcePolicy.mode,
        gmailEnabled: sourcePolicy.gmailEnabled,
        outlookEnabled: sourcePolicy.outlookEnabled,
      },
      refresh: {
        partial: refresh.partial,
        limitedBy: refresh.limitedBy || null,
        catchUpScheduled: refresh.catchUpScheduled,
        scheduleState: refresh.scheduleState || null,
        processedMessages: refresh.processedMessages,
        preservedExisting: refresh.preservedExisting,
        generationFallbackUsed: refresh.generationFallbackUsed || false,
        generationErrorCode: refresh.generationErrorCode || null,
      },
      timings,
    },
  });

  logger.info('AI suggestion refresh timings', {
    userId,
    requestId: options.requestId || null,
    source: options.source || 'ai',
    mode: context.mode,
    partial: refresh.partial,
    limitedBy: refresh.limitedBy || null,
    catchUpScheduled: refresh.catchUpScheduled,
    scheduleState: refresh.scheduleState || null,
    preservedExisting: refresh.preservedExisting,
    generationFallbackUsed: refresh.generationFallbackUsed || false,
    generationErrorCode: refresh.generationErrorCode || null,
    timings,
  });

  return {
    ingested: ingestResult,
    suggestions: stored,
    contexts,
    context,
    refresh,
  };
}

module.exports = {
  refreshSuggestionsForUser,
  scheduleManualRefreshForUser,
};
