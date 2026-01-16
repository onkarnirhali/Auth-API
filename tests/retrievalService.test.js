'use strict';

jest.mock('../src/services/ai/embeddingService', () => ({
  embedText: jest.fn(),
}));
jest.mock('../src/models/emailEmbeddingModel', () => ({
  searchSimilar: jest.fn(),
  listRecent: jest.fn(),
}));

const { embedText } = require('../src/services/ai/embeddingService');
const emailEmbeddings = require('../src/models/emailEmbeddingModel');
const { getRelevantEmailContexts } = require('../src/services/suggestions/retrievalService');

describe('retrieval service', () => {
  let consoleSpy;
  beforeEach(() => {
    jest.resetAllMocks();
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy?.mockRestore();
  });

  test('uses vector search when embeddings available', async () => {
    embedText.mockResolvedValue([0.1, 0.2]);
    emailEmbeddings.searchSimilar.mockResolvedValue([{ gmailMessageId: 'm1' }]);
    const contexts = await getRelevantEmailContexts(42);
    expect(embedText).toHaveBeenCalled();
    expect(emailEmbeddings.searchSimilar).toHaveBeenCalledWith(42, [0.1, 0.2], expect.any(Number));
    expect(contexts).toHaveLength(1);
  });

  test('falls back to recency when vector search fails', async () => {
    embedText.mockRejectedValue(new Error('no embed'));
    emailEmbeddings.listRecent.mockResolvedValue([{ gmailMessageId: 'recent' }]);
    const contexts = await getRelevantEmailContexts(99);
    expect(emailEmbeddings.listRecent).toHaveBeenCalled();
    expect(contexts[0].gmailMessageId).toBe('recent');
  });
});
