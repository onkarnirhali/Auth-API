'use strict';

const { mergeSuggestions } = require('../src/services/suggestions/suggestionMergeService');

describe('suggestion merge service', () => {
  test('merges and deduplicates suggestions by title', () => {
    const merged = mergeSuggestions({
      emailSuggestions: [
        { title: 'Send project update', confidence: 0.8, metadata: { source: 'gmail', sourceLabel: 'Gmail Inbox' } },
        { title: 'Review invoice', confidence: 0.6, metadata: { source: 'outlook', sourceLabel: 'Outlook Inbox' } },
      ],
      historySuggestions: [
        { title: 'send project update', metadata: { source: 'task_history', sourceLabel: 'Learned from previous tasks' } },
        { title: 'Plan weekly priorities', metadata: { source: 'task_history', sourceLabel: 'Learned from previous tasks' } },
      ],
      maxResults: 10,
    });

    expect(merged).toHaveLength(3);
    expect(merged.find((item) => item.title === 'Send project update')).toBeTruthy();
    expect(merged.find((item) => item.title === 'Review invoice')).toBeTruthy();
    expect(merged.find((item) => item.title === 'Plan weekly priorities')).toBeTruthy();
  });
});
