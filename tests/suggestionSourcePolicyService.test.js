'use strict';

jest.mock('../src/models/providerLinkModel', () => ({
  listByUser: jest.fn(),
}));
jest.mock('../src/models/gmailTokenModel', () => ({
  findByUserId: jest.fn(),
}));
jest.mock('../src/models/outlookTokenModel', () => ({
  findByUserId: jest.fn(),
}));

const providerLinks = require('../src/models/providerLinkModel');
const gmailTokens = require('../src/models/gmailTokenModel');
const outlookTokens = require('../src/models/outlookTokenModel');
const {
  resolveSuggestionSourcePolicy,
  buildSuggestionContext,
} = require('../src/services/suggestions/suggestionSourcePolicyService');

describe('suggestion source policy service', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    providerLinks.listByUser.mockResolvedValue([]);
    gmailTokens.findByUserId.mockResolvedValue(null);
    outlookTokens.findByUserId.mockResolvedValue(null);
  });

  test('falls back to Gmail token when no provider links exist', async () => {
    gmailTokens.findByUserId.mockResolvedValue({ id: 1, userId: 10 });

    const policy = await resolveSuggestionSourcePolicy(10);
    expect(policy).toEqual({
      gmailEnabled: true,
      outlookEnabled: false,
      allowedEmailProviders: ['gmail'],
      mode: 'gmail_only',
    });
  });

  test('explicit link disconnect takes precedence over token fallback', async () => {
    providerLinks.listByUser.mockResolvedValue([
      { provider: 'gmail', linked: false, ingestEnabled: false },
    ]);
    gmailTokens.findByUserId.mockResolvedValue({ id: 2, userId: 11 });

    const policy = await resolveSuggestionSourcePolicy(11);
    expect(policy.gmailEnabled).toBe(false);
    expect(policy.allowedEmailProviders).toEqual([]);
    expect(policy.mode).toBe('none');
  });

  test('uses both providers when tokens exist and links are missing', async () => {
    gmailTokens.findByUserId.mockResolvedValue({ id: 3, userId: 12 });
    outlookTokens.findByUserId.mockResolvedValue({ id: 4, userId: 12 });

    const policy = await resolveSuggestionSourcePolicy(12);
    expect(policy.mode).toBe('both');
    expect(policy.allowedEmailProviders).toEqual(['gmail', 'outlook']);
  });

  test('buildSuggestionContext returns no-provider reason when empty + none mode', () => {
    const context = buildSuggestionContext({
      mode: 'none',
      hasSuggestions: false,
      historyReady: true,
    });
    expect(context).toEqual({
      mode: 'none',
      reasonCode: 'NO_PROVIDER_CONNECTED',
    });
  });

  test('buildSuggestionContext returns insufficient-history reason when none mode and no history', () => {
    const context = buildSuggestionContext({
      mode: 'none',
      hasSuggestions: false,
      historyReady: false,
    });
    expect(context).toEqual({
      mode: 'none',
      reasonCode: 'INSUFFICIENT_HISTORY',
    });
  });
});
