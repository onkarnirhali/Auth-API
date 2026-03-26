'use strict';

jest.mock('../src/services/ai/providerFactory', () => ({
  getProvider: jest.fn(),
}));

const { getProvider } = require('../src/services/ai/providerFactory');
const { generateStructured } = require('../src/services/ai/index');
const { AI_GENERATION_ERROR_CODES } = require('../src/services/ai/errors');

const TEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
};

describe('generateStructured', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('returns validated structured output', async () => {
    getProvider.mockReturnValue({
      name: 'openai',
      generateStructured: jest.fn().mockResolvedValue({
        parsed: { items: ['a'] },
        rawText: '{"items":["a"]}',
        usage: { totalTokens: 10 },
        provider: 'openai',
        model: 'gpt-4o-mini',
        finishReason: 'stop',
        refusal: null,
      }),
    });

    const result = await generateStructured({
      systemPrompt: 'system',
      userPrompt: 'user',
      schemaName: 'test_schema_v1',
      schema: TEST_SCHEMA,
    });

    expect(result.parsed).toEqual({ items: ['a'] });
    expect(result.validationErrors).toBeNull();
    expect(result.finishReason).toBe('stop');
  });

  test('throws schema validation failure when payload violates schema', async () => {
    getProvider.mockReturnValue({
      name: 'openai',
      generateStructured: jest.fn().mockResolvedValue({
        parsed: { wrong: true },
        rawText: '{"wrong":true}',
        usage: null,
        provider: 'openai',
        model: 'gpt-4o-mini',
        finishReason: 'stop',
        refusal: null,
      }),
    });

    await expect(
      generateStructured({
        systemPrompt: 'system',
        userPrompt: 'user',
        schemaName: 'test_schema_v1',
        schema: TEST_SCHEMA,
      })
    ).rejects.toMatchObject({
      code: AI_GENERATION_ERROR_CODES.SCHEMA_VALIDATION_FAILED,
    });
  });

  test('throws refusal when provider refuses', async () => {
    getProvider.mockReturnValue({
      name: 'openai',
      generateStructured: jest.fn().mockResolvedValue({
        parsed: null,
        rawText: '',
        usage: null,
        provider: 'openai',
        model: 'gpt-4o-mini',
        finishReason: 'stop',
        refusal: 'I cannot comply',
      }),
    });

    await expect(
      generateStructured({
        systemPrompt: 'system',
        userPrompt: 'user',
        schemaName: 'test_schema_v1',
        schema: TEST_SCHEMA,
      })
    ).rejects.toMatchObject({
      code: AI_GENERATION_ERROR_CODES.REFUSAL,
    });
  });

  test('throws max tokens when provider truncates structured output', async () => {
    getProvider.mockReturnValue({
      name: 'openai',
      generateStructured: jest.fn().mockResolvedValue({
        parsed: null,
        rawText: '{"items":',
        usage: null,
        provider: 'openai',
        model: 'gpt-4o-mini',
        finishReason: 'length',
        refusal: null,
      }),
    });

    await expect(
      generateStructured({
        systemPrompt: 'system',
        userPrompt: 'user',
        schemaName: 'test_schema_v1',
        schema: TEST_SCHEMA,
      })
    ).rejects.toMatchObject({
      code: AI_GENERATION_ERROR_CODES.MAX_TOKENS,
    });
  });

  test('throws provider error when structured output is unsupported', async () => {
    getProvider.mockReturnValue({
      name: 'legacy',
    });

    await expect(
      generateStructured({
        systemPrompt: 'system',
        userPrompt: 'user',
        schemaName: 'test_schema_v1',
        schema: TEST_SCHEMA,
      })
    ).rejects.toMatchObject({
      code: AI_GENERATION_ERROR_CODES.PROVIDER_ERROR,
    });
  });
});
