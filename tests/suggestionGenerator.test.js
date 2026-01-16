'use strict';

jest.mock('../src/services/ai/index', () => ({
  generateText: jest.fn(),
}));

const { generateText } = require('../src/services/ai/index');
const { generateSuggestionsFromContexts } = require('../src/services/ai/suggestionGenerator');

describe('suggestion generator', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('returns normalized suggestions from valid JSON', async () => {
    generateText.mockResolvedValue({
      text: JSON.stringify({
        suggestions: [
          {
            title: 'Reply to Rahul about proposal',
            detail: 'Send the updated deck today',
            sourceMessageIds: ['m1'],
            confidence: 0.82,
          },
        ],
      }),
    });

    const contexts = [{ gmailMessageId: 'm1', subject: 'Proposal', plainText: 'Please reply' }];
    const suggestions = await generateSuggestionsFromContexts(contexts);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].title).toMatch(/Reply to Rahul/);
    expect(suggestions[0].confidence).toBeCloseTo(0.82);
    expect(suggestions[0].sourceMessageIds).toContain('m1');
  });

  test('throws when AI response is not JSON', async () => {
    generateText.mockResolvedValue({ text: 'not json' });
    const contexts = [{ gmailMessageId: 'm1', subject: 'X', plainText: 'Body' }];
    await expect(generateSuggestionsFromContexts(contexts)).rejects.toThrow('AI response was not valid JSON');
  });
});
