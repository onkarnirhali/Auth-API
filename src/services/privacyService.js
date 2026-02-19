'use strict';

const pool = require('../config/db');

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role || 'user',
    isEnabled: row.is_enabled !== false,
    lastActiveAt: row.last_active_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTodo(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSuggestion(row) {
  return {
    id: row.id,
    title: row.title,
    detail: row.detail,
    sourceMessageIds: row.source_message_ids || [],
    status: row.status,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProvider(row) {
  return {
    provider: row.provider,
    linked: Boolean(row.linked),
    ingestEnabled: Boolean(row.ingest_enabled),
    lastLinkedAt: row.last_linked_at || null,
    lastSyncAt: row.last_sync_at || null,
    metadata: row.metadata || {},
  };
}

function mapEvent(row) {
  return {
    id: row.id,
    type: row.type,
    requestId: row.request_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    source: row.source,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

function mapNote(row) {
  return {
    id: Number(row.id),
    title: row.title,
    content: row.content_json || {},
    isPasswordProtected: row.is_password_protected === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNoteTaskLink(row) {
  return {
    noteId: Number(row.note_id),
    taskId: Number(row.task_id),
    createdAt: row.created_at,
  };
}

async function exportUserData(userId) {
  const userResult = await pool.query(
    `
    SELECT id, email, name, role, is_enabled, last_active_at, created_at, updated_at
    FROM users
    WHERE id = $1
    `,
    [userId]
  );
  const userRow = userResult.rows[0];
  if (!userRow) return null;

  const [todosResult, suggestionsResult, providersResult, eventsResult, notesResult, noteLinksResult] = await Promise.all([
    pool.query(
      `
      SELECT id, title, description, status, priority, due_date, created_at, updated_at
      FROM todos
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT id, title, detail, source_message_ids, status, metadata, created_at, updated_at
      FROM ai_suggestions
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT provider, linked, ingest_enabled, last_linked_at, last_sync_at, metadata
      FROM user_provider_links
      WHERE user_id = $1
      ORDER BY provider ASC
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT id, type, request_id, ip_address, user_agent, source, metadata, created_at
      FROM events
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 500
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT id, title, content_json, is_password_protected, created_at, updated_at
      FROM notes
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT note_id, task_id, created_at
      FROM note_task_links
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    ),
  ]);

  const todos = todosResult.rows.map(mapTodo);
  const suggestions = suggestionsResult.rows.map(mapSuggestion);
  const providers = providersResult.rows.map(mapProvider);
  const events = eventsResult.rows.map(mapEvent);
  const noteItems = notesResult.rows.map(mapNote);
  const noteTaskLinks = noteLinksResult.rows.map(mapNoteTaskLink);

  return {
    exportedAt: new Date().toISOString(),
    user: mapUser(userRow),
    data: {
      todos,
      suggestions,
      providers,
      events,
      notes: noteItems,
      noteTaskLinks,
    },
    summary: {
      todoCount: todos.length,
      suggestionCount: suggestions.length,
      providerCount: providers.length,
      eventCount: events.length,
      noteCount: noteItems.length,
      noteTaskLinkCount: noteTaskLinks.length,
    },
  };
}

async function deleteUserAndData(userId) {
  const { rows } = await pool.query(
    `
    DELETE FROM users
    WHERE id = $1
    RETURNING id, email, name, role, is_enabled, last_active_at, created_at, updated_at
    `,
    [userId]
  );
  const deleted = rows[0];
  if (!deleted) return null;
  return {
    user: mapUser(deleted),
    deletedAt: new Date().toISOString(),
  };
}

module.exports = {
  exportUserData,
  deleteUserAndData,
};
