'use strict';

jest.mock('../src/services/gmail/client', () => ({
  getAuthorizedGmail: jest.fn(),
}));
jest.mock('../src/services/ai/embeddingService', () => ({
  embedTextWithUsage: jest.fn(),
}));
jest.mock('../src/models/emailEmbeddingModel', () => ({
  upsertMany: jest.fn(),
}));
jest.mock('../src/models/gmailSyncCursorModel', () => ({
  getByUserId: jest.fn(),
  upsertCursor: jest.fn(),
}));

const { ingestNewEmailsForUser } = require('../src/services/gmail/ingestionService');
const { getAuthorizedGmail } = require('../src/services/gmail/client');
const { embedTextWithUsage } = require('../src/services/ai/embeddingService');
const emailEmbeddings = require('../src/models/emailEmbeddingModel');
const gmailSyncCursor = require('../src/models/gmailSyncCursorModel');

describe('gmail ingestion service', () => {
  const gmailStub = {
    users: {
      messages: {
        list: jest.fn(),
        get: jest.fn(),
      },
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    getAuthorizedGmail.mockResolvedValue({ gmail: gmailStub });
    gmailSyncCursor.getByUserId.mockResolvedValue({ lastInternalDateMs: null });
    gmailSyncCursor.upsertCursor.mockResolvedValue({});
    emailEmbeddings.upsertMany.mockResolvedValue([{ gmailMessageId: 'm1' }, { gmailMessageId: 'm2' }]);
    embedTextWithUsage.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });

    gmailStub.users.messages.list.mockResolvedValue({
      data: { messages: [{ id: 'm1' }, { id: 'm2' }], nextPageToken: null },
    });

    const messagePayload = {
      payload: {
        mimeType: 'text/plain',
        body: { data: Buffer.from('Follow up with Rahul about the proposal').toString('base64') },
        headers: [{ name: 'Subject', value: 'Proposal follow-up' }, { name: 'Date', value: 'Mon, 01 Jan 2024 00:00:00 +0000' }],
      },
      snippet: 'Follow up with Rahul',
      internalDate: `${Date.now()}`,
      id: 'm1',
      threadId: 't1',
      labelIds: ['INBOX'],
    };

    gmailStub.users.messages.get.mockResolvedValue({ data: messagePayload });
  });

  test('ingests and embeds new messages', async () => {
    const result = await ingestNewEmailsForUser(123, { maxMessages: 2 });

    expect(getAuthorizedGmail).toHaveBeenCalledWith(123);
    expect(gmailStub.users.messages.list).toHaveBeenCalled();
    expect(gmailStub.users.messages.get).toHaveBeenCalledTimes(2);
    expect(embedTextWithUsage).toHaveBeenCalled();
    expect(emailEmbeddings.upsertMany).toHaveBeenCalledWith(
      123,
      expect.arrayContaining([
        expect.objectContaining({
          gmailMessageId: 'm1',
          subject: 'Proposal follow-up',
          plainText: expect.stringContaining('Follow up'),
        }),
      ])
    );
    expect(result.ingested).toBe(2);
  });
});
