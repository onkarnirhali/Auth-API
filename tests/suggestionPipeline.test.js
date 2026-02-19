'use strict';

jest.mock('../src/models/aiSuggestionModel', () => ({
  listByUser: jest.fn(),
  replaceForUser: jest.fn(),
}));
jest.mock('../src/services/gmail/ingestionService', () => ({
  ingestNewEmailsForUser: jest.fn(),
}));
jest.mock('../src/services/outlook/ingestionService', () => ({
  ingestNewOutlookEmails: jest.fn(),
}));
jest.mock('../src/services/suggestions/retrievalService', () => ({
  getRelevantEmailContexts: jest.fn(),
}));
jest.mock('../src/services/ai/suggestionGenerator', () => ({
  generateSuggestionsFromContextsWithUsage: jest.fn(),
}));
jest.mock('../src/services/suggestions/suggestionSource', () => ({
  enrichSuggestionsWithSource: jest.fn((suggestions) => suggestions),
}));
jest.mock('../src/services/suggestions/suggestionMergeService', () => ({
  mergeSuggestions: jest.fn(({ emailSuggestions = [], historySuggestions = [] }) => [
    ...emailSuggestions,
    ...historySuggestions,
  ]),
}));
jest.mock('../src/services/suggestions/taskHistorySuggestionService', () => ({
  generateTaskHistorySuggestions: jest.fn(),
}));
jest.mock('../src/services/suggestions/suggestionSourcePolicyService', () => ({
  resolveSuggestionSourcePolicy: jest.fn(),
  buildSuggestionContext: jest.fn(),
}));
jest.mock('../src/services/eventService', () => ({
  logEventSafe: jest.fn(),
}));
jest.mock('../src/services/ai/tokenUsageService', () => ({
  logGenerationUsage: jest.fn(),
}));
jest.mock('../src/services/providerConnection/providerDisconnectService', () => ({
  disconnectProviderForUser: jest.fn(),
  isInvalidGrantError: jest.fn(),
}));

const aiSuggestions = require('../src/models/aiSuggestionModel');
const { ingestNewEmailsForUser } = require('../src/services/gmail/ingestionService');
const { ingestNewOutlookEmails } = require('../src/services/outlook/ingestionService');
const { getRelevantEmailContexts } = require('../src/services/suggestions/retrievalService');
const { generateSuggestionsFromContextsWithUsage } = require('../src/services/ai/suggestionGenerator');
const { enrichSuggestionsWithSource } = require('../src/services/suggestions/suggestionSource');
const { mergeSuggestions } = require('../src/services/suggestions/suggestionMergeService');
const { generateTaskHistorySuggestions } = require('../src/services/suggestions/taskHistorySuggestionService');
const {
  resolveSuggestionSourcePolicy,
  buildSuggestionContext,
} = require('../src/services/suggestions/suggestionSourcePolicyService');
const {
  disconnectProviderForUser,
  isInvalidGrantError,
} = require('../src/services/providerConnection/providerDisconnectService');
const { AiProviderError } = require('../src/services/ai/errors');
const { refreshSuggestionsForUser } = require('../src/services/suggestions/suggestionPipeline');

describe('suggestion pipeline', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    enrichSuggestionsWithSource.mockImplementation((suggestions) => suggestions);
    mergeSuggestions.mockImplementation(({ emailSuggestions = [], historySuggestions = [] }) => [
      ...emailSuggestions,
      ...historySuggestions,
    ]);
    ingestNewEmailsForUser.mockResolvedValue({ ingested: 1, processedMessages: 1 });
    getRelevantEmailContexts.mockResolvedValue([{ gmailMessageId: 'm1', subject: 'Subject' }]);
    aiSuggestions.listByUser.mockResolvedValue([]);
    aiSuggestions.replaceForUser.mockImplementation(async (_userId, suggestions) => suggestions);
    generateTaskHistorySuggestions.mockResolvedValue({
      historyReady: true,
      suggestions: [
        {
          title: 'History suggestion',
          detail: 'From task history',
          sourceMessageIds: [],
          confidence: null,
          status: 'suggested',
          metadata: { source: 'task_history', sourceLabel: 'Learned from previous tasks' },
        },
      ],
    });
    resolveSuggestionSourcePolicy.mockResolvedValue({
      gmailEnabled: true,
      outlookEnabled: false,
      allowedEmailProviders: ['gmail'],
      mode: 'gmail_only',
    });
    buildSuggestionContext.mockImplementation(({ mode }) => ({ mode }));
    disconnectProviderForUser.mockResolvedValue({
      provider: 'gmail',
      linked: false,
      ingestEnabled: false,
      metadata: { reconnectRequired: true },
    });
    isInvalidGrantError.mockReturnValue(false);
  });

  test('falls back gracefully when generator returns invalid JSON', async () => {
    generateSuggestionsFromContextsWithUsage.mockRejectedValue(
      new AiProviderError('AI response was not valid JSON', { code: 'INVALID_JSON' })
    );

    const result = await refreshSuggestionsForUser(123, {
      source: 'manual',
      preserveExistingOnEmpty: true,
    });

    expect(result.refresh.generationFallbackUsed).toBe(true);
    expect(result.refresh.generationErrorCode).toBe('INVALID_JSON');
    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'History suggestion' }),
      ])
    );
  });

  test('preserves existing suggestions when fallback yields empty merged result', async () => {
    generateSuggestionsFromContextsWithUsage.mockRejectedValue(
      new AiProviderError('AI response was not valid JSON', { code: 'INVALID_JSON' })
    );
    generateTaskHistorySuggestions.mockResolvedValue({
      historyReady: false,
      suggestions: [],
    });
    aiSuggestions.listByUser.mockResolvedValue([
      { id: 9, title: 'Existing suggestion', metadata: { source: 'gmail' } },
    ]);

    const result = await refreshSuggestionsForUser(456, {
      source: 'manual',
      preserveExistingOnEmpty: true,
    });

    expect(result.refresh.generationFallbackUsed).toBe(true);
    expect(result.refresh.preservedExisting).toBe(true);
    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Existing suggestion' }),
      ])
    );
  });

  test('auto-disconnects Gmail when ingest fails with invalid_grant', async () => {
    const grantError = new Error('invalid_grant');
    ingestNewEmailsForUser.mockRejectedValue(grantError);
    getRelevantEmailContexts.mockResolvedValue([]);
    generateTaskHistorySuggestions.mockResolvedValue({ historyReady: false, suggestions: [] });
    isInvalidGrantError.mockReturnValue(true);

    await refreshSuggestionsForUser(789, { source: 'scheduler' });

    expect(isInvalidGrantError).toHaveBeenCalledWith(grantError);
    expect(disconnectProviderForUser).toHaveBeenCalledWith(
      789,
      'gmail',
      expect.objectContaining({
        source: 'scheduler',
        automatic: true,
        reason: 'invalid_grant',
        markReconnectRequired: true,
      })
    );
  });

  test('auto-disconnects Outlook when ingest fails with invalid_grant', async () => {
    const grantError = new Error('invalid_grant');
    resolveSuggestionSourcePolicy.mockResolvedValue({
      gmailEnabled: false,
      outlookEnabled: true,
      allowedEmailProviders: ['outlook'],
      mode: 'outlook_only',
    });
    ingestNewOutlookEmails.mockRejectedValue(grantError);
    getRelevantEmailContexts.mockResolvedValue([]);
    generateTaskHistorySuggestions.mockResolvedValue({ historyReady: false, suggestions: [] });
    disconnectProviderForUser.mockResolvedValue({
      provider: 'outlook',
      linked: false,
      ingestEnabled: false,
      metadata: { reconnectRequired: true },
    });
    isInvalidGrantError.mockReturnValue(true);

    await refreshSuggestionsForUser(321, { source: 'scheduler' });

    expect(isInvalidGrantError).toHaveBeenCalledWith(grantError);
    expect(disconnectProviderForUser).toHaveBeenCalledWith(
      321,
      'outlook',
      expect.objectContaining({
        source: 'scheduler',
        automatic: true,
        reason: 'invalid_grant',
        markReconnectRequired: true,
      })
    );
  });
});
