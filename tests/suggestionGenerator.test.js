'use strict';

jest.mock('../src/services/ai/index', () => ({
  generateStructured: jest.fn(),
}));

const { generateStructured } = require('../src/services/ai/index');
const { generateSuggestionsFromContexts } = require('../src/services/ai/suggestionGenerator');

describe('suggestion generator', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('returns normalized suggestions from valid structured output', async () => {
    generateStructured.mockResolvedValue({
      parsed: {
        suggestions: [
          {
            title: '  Reply to Rahul about proposal  ',
            detail: 'Send the updated deck today',
            sourceMessageIds: ['m1'],
            confidence: 0.82,
          },
        ],
      },
      usage: null,
      provider: 'openai',
      model: 'gpt-4o-mini',
    });

    const contexts = [{ gmailMessageId: 'm1', subject: 'Proposal', plainText: 'Please reply' }];
    const suggestions = await generateSuggestionsFromContexts(contexts);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].title).toBe('Reply to Rahul about proposal');
    expect(suggestions[0].confidence).toBeCloseTo(0.82);
    expect(suggestions[0].sourceMessageIds).toContain('m1');
    expect(suggestions[0].metadata).toEqual(
      expect.objectContaining({
        schemaName: 'ai_email_suggestions_v1',
        schemaVersion: 1,
      })
    );
  });

  test('throws when suggestion references an unknown message id', async () => {
    generateStructured.mockResolvedValue({
      parsed: {
        suggestions: [
          {
            title: 'Reply to Rahul about proposal',
            detail: 'Send the updated deck today',
            sourceMessageIds: ['missing'],
            confidence: 0.82,
          },
        ],
      },
      usage: null,
      provider: 'openai',
      model: 'gpt-4o-mini',
    });

    const contexts = [{ gmailMessageId: 'm1', subject: 'Proposal', plainText: 'Please reply' }];
    await expect(generateSuggestionsFromContexts(contexts)).rejects.toMatchObject({
      message: 'AI response failed schema validation',
      code: 'SCHEMA_VALIDATION_FAILED',
    });
  });

  test('throws when suggestion repeats the same source message id', async () => {
    generateStructured.mockResolvedValue({
      parsed: {
        suggestions: [
          {
            title: 'Reply to Rahul about proposal',
            detail: 'Send the updated deck today',
            sourceMessageIds: ['m1', 'm1'],
            confidence: 0.82,
          },
        ],
      },
      usage: null,
      provider: 'openai',
      model: 'gpt-4o-mini',
    });

    const contexts = [{ gmailMessageId: 'm1', subject: 'Proposal', plainText: 'Please reply' }];
    await expect(generateSuggestionsFromContexts(contexts)).rejects.toMatchObject({
      message: 'AI response failed schema validation',
      code: 'SCHEMA_VALIDATION_FAILED',
    });
  });
});
