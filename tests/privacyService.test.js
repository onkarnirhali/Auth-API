'use strict';

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
}));

const pool = require('../src/config/db');
const { exportUserData, deleteUserAndData } = require('../src/services/privacyService');

describe('privacyService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('exports user scoped data with summary counts', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{
          id: 10,
          email: 'test@example.com',
          name: 'Test User',
          role: 'user',
          is_enabled: true,
          last_active_at: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 1,
          title: 'Todo A',
          description: null,
          status: 'pending',
          priority: 'normal',
          due_date: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 20,
          title: 'Suggestion A',
          detail: 'Detail',
          source_message_ids: ['gmail:1'],
          status: 'suggested',
          metadata: {},
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          provider: 'gmail',
          linked: true,
          ingest_enabled: true,
          last_linked_at: null,
          last_sync_at: null,
          metadata: {},
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 50,
          type: 'privacy.export.requested',
          request_id: 'req-1',
          ip_address: '127.0.0.1',
          user_agent: 'jest',
          source: 'api',
          metadata: {},
          created_at: '2026-01-01T00:00:00.000Z',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 100,
          title: 'Note A',
          content_json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] },
          is_password_protected: false,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          note_id: 100,
          task_id: 1,
          created_at: '2026-01-01T00:00:00.000Z',
        }],
      });

    const result = await exportUserData(10);

    expect(result).toBeTruthy();
    expect(result.user.email).toBe('test@example.com');
    expect(result.summary).toEqual({
      todoCount: 1,
      suggestionCount: 1,
      providerCount: 1,
      eventCount: 1,
      noteCount: 1,
      noteTaskLinkCount: 1,
    });
  });

  it('returns null when export user is missing', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const result = await exportUserData(404);
    expect(result).toBeNull();
  });

  it('deletes user and returns deletion summary', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: 10,
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        is_enabled: true,
        last_active_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      }],
    });

    const result = await deleteUserAndData(10);

    expect(result).toBeTruthy();
    expect(result.user.id).toBe(10);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM users'), [10]);
  });

  it('returns null when delete user is missing', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const result = await deleteUserAndData(404);
    expect(result).toBeNull();
  });
});
