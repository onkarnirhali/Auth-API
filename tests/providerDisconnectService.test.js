'use strict';

jest.mock('../src/models/gmailTokenModel', () => ({
  removeByUserId: jest.fn(),
}));
jest.mock('../src/models/outlookTokenModel', () => ({
  removeByUserId: jest.fn(),
}));
jest.mock('../src/services/eventService', () => ({
  logEventSafe: jest.fn(),
}));
jest.mock('../src/services/providerConnection/providerConnectionService', () => ({
  normalizeProvider: jest.fn((provider) => {
    const normalized = String(provider || '').trim().toLowerCase();
    if (!['gmail', 'outlook'].includes(normalized)) {
      throw new Error(`Unsupported provider: ${provider}`);
    }
    return normalized;
  }),
  disconnectProviderPolicy: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

const { logEventSafe } = require('../src/services/eventService');
const { disconnectProviderPolicy, normalizeProvider } = require('../src/services/providerConnection/providerConnectionService');
const {
  isInvalidGrantError,
  disconnectProviderForUser,
} = require('../src/services/providerConnection/providerDisconnectService');

describe('providerDisconnectService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    normalizeProvider.mockImplementation((provider) => {
      const normalized = String(provider || '').trim().toLowerCase();
      if (!['gmail', 'outlook'].includes(normalized)) {
        throw new Error(`Unsupported provider: ${provider}`);
      }
      return normalized;
    });
    disconnectProviderPolicy.mockResolvedValue({
      provider: 'gmail',
      linked: false,
      ingestEnabled: false,
      metadata: {},
    });
  });

  test('detects invalid_grant from nested provider errors', () => {
    const err = {
      message: 'refresh failed',
      response: {
        data: {
          error: 'invalid_grant',
          error_description: 'refresh token expired',
        },
      },
    };

    expect(isInvalidGrantError(err)).toBe(true);
  });

  test('does not flag unrelated errors as invalid_grant', () => {
    expect(isInvalidGrantError(new Error('network timeout'))).toBe(false);
  });

  test('marks reconnect required on automatic disconnect', async () => {
    disconnectProviderPolicy.mockResolvedValue({
      provider: 'gmail',
      linked: false,
      ingestEnabled: false,
      metadata: { reconnectRequired: true },
    });

    await disconnectProviderForUser(100, 'gmail', {
      source: 'scheduler',
      automatic: true,
      reason: 'invalid_grant',
      markReconnectRequired: true,
    });

    expect(disconnectProviderPolicy).toHaveBeenCalledWith(
      100,
      'gmail',
      expect.objectContaining({
        clearReconnectMetadata: false,
        metadata: expect.objectContaining({
          reconnectRequired: true,
          reconnectReason: 'invalid_grant',
        }),
      })
    );
    expect(logEventSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'provider.disconnected',
        metadata: expect.objectContaining({
          provider: 'gmail',
          automatic: true,
          reconnectRequired: true,
        }),
      })
    );
  });

  test('clears reconnect metadata on manual disconnect', async () => {
    disconnectProviderPolicy.mockResolvedValue({
      provider: 'outlook',
      linked: false,
      ingestEnabled: false,
      metadata: {},
    });

    await disconnectProviderForUser(222, 'outlook', {
      source: 'api',
      automatic: false,
      reason: 'manual',
      markReconnectRequired: false,
    });

    expect(disconnectProviderPolicy).toHaveBeenCalledWith(
      222,
      'outlook',
      expect.objectContaining({
        clearReconnectMetadata: true,
      })
    );
  });
});
