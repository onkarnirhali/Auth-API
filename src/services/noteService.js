'use strict';

const pool = require('../config/db');
const { assertPassword, hashPassword, verifyPassword } = require('../utils/notePassword');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function serviceError(message, code, status = 400, details) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  err.expose = true;
  if (details !== undefined) err.details = details;
  return err;
}

function useDb(client) {
  return client || pool;
}

function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function clampOffset(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function normalizeContent(content) {
  if (content && typeof content === 'object' && !Array.isArray(content)) return content;
  return {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  };
}

function extractText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(extractText).join(' ');
  if (typeof value === 'object') {
    const parts = [];
    if (typeof value.text === 'string') parts.push(value.text);
    if (value.content) parts.push(extractText(value.content));
    return parts.join(' ');
  }
  return '';
}

function previewFromContent(content) {
  const plain = extractText(content).replace(/\s+/g, ' ').trim();
  if (!plain) return null;
  return plain.length > 140 ? `${plain.slice(0, 137)}...` : plain;
}

function mapNoteSummary(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    title: row.title,
    isPasswordProtected: row.is_password_protected === true,
    preview: row.is_password_protected ? null : previewFromContent(row.content_json),
    linkedTaskCount: Number(row.linked_task_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNoteDetail(row, { includeContent }) {
  const summary = mapNoteSummary(row);
  const requiresUnlock = summary.isPasswordProtected && !includeContent;
  return {
    ...summary,
    requiresUnlock,
    content: requiresUnlock ? null : normalizeContent(row.content_json),
  };
}

async function getViewPreference(userId, options = {}) {
  const db = useDb(options.db);
  const { rows } = await db.query('SELECT notes_view_mode FROM users WHERE id = $1', [userId]);
  return rows[0]?.notes_view_mode || 'list';
}

async function setViewPreference(userId, viewMode, options = {}) {
  if (!['list', 'grid'].includes(viewMode)) {
    throw serviceError('Invalid view mode', 'NOTE_VIEW_MODE_INVALID', 400);
  }
  const db = useDb(options.db);
  await db.query('UPDATE users SET notes_view_mode = $1, updated_at = NOW() WHERE id = $2', [viewMode, userId]);
  return viewMode;
}

async function list(userId, query = {}, options = {}) {
  const db = useDb(options.db);
  const clauses = ['n.user_id = $1'];
  const params = [userId];
  let i = 2;

  if (query.q) {
    clauses.push(`n.title ILIKE $${i++}`);
    params.push(`%${String(query.q).trim()}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = clampLimit(query.limit);
  const offset = clampOffset(query.offset);
  const dataParams = [...params, limit, offset];
  const limitPos = params.length + 1;
  const offsetPos = params.length + 2;

  const [itemsRes, totalRes, viewMode] = await Promise.all([
    db.query(
      `
      SELECT
        n.*,
        COUNT(l.id)::int AS linked_task_count
      FROM notes n
      LEFT JOIN note_task_links l
        ON l.note_id = n.id
       AND l.user_id = n.user_id
      ${where}
      GROUP BY n.id
      ORDER BY n.updated_at DESC
      LIMIT $${limitPos}
      OFFSET $${offsetPos}
      `,
      dataParams
    ),
    db.query(`SELECT COUNT(*)::int AS count FROM notes n ${where}`, params),
    getViewPreference(userId, { db }),
  ]);

  return {
    items: itemsRes.rows.map(mapNoteSummary),
    total: Number(totalRes.rows[0]?.count || 0),
    limit,
    offset,
    viewMode,
  };
}

async function findRowById(db, userId, id) {
  const { rows } = await db.query(
    `
    SELECT
      n.*,
      COUNT(l.id)::int AS linked_task_count
    FROM notes n
    LEFT JOIN note_task_links l
      ON l.note_id = n.id
     AND l.user_id = n.user_id
    WHERE n.id = $1
      AND n.user_id = $2
    GROUP BY n.id
    `,
    [id, userId]
  );
  return rows[0] || null;
}

async function findById(userId, id, options = {}) {
  const db = useDb(options.db);
  const row = await findRowById(db, userId, id);
  if (!row) return null;
  const includeContent = options.includeProtectedContent === true || row.is_password_protected !== true;
  return mapNoteDetail(row, { includeContent });
}

async function create(userId, input, options = {}) {
  const db = useDb(options.db);
  const title = String(input.title || '').trim();
  if (!title) throw serviceError('Title is required', 'NOTE_TITLE_REQUIRED', 400);
  if (title.length > 200) throw serviceError('Title exceeds max length 200', 'NOTE_TITLE_TOO_LONG', 400);

  const content = normalizeContent(input.content);
  let isPasswordProtected = false;
  let passwordHash = null;
  let passwordSalt = null;
  let passwordUpdatedAt = null;

  if (input.passwordProtection?.enabled === true) {
    assertPassword(input.passwordProtection.password);
    const generated = await hashPassword(input.passwordProtection.password);
    isPasswordProtected = true;
    passwordHash = generated.hash;
    passwordSalt = generated.salt;
    passwordUpdatedAt = new Date();
  }

  const now = new Date();
  const { rows } = await db.query(
    `
    INSERT INTO notes
      (user_id, title, content_json, is_password_protected, password_hash, password_salt, password_updated_at, created_at, updated_at)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
    `,
    [userId, title, content, isPasswordProtected, passwordHash, passwordSalt, passwordUpdatedAt, now, now]
  );

  const row = rows[0];
  row.linked_task_count = 0;
  return mapNoteDetail(row, { includeContent: true });
}

async function openProtected(userId, id, password, options = {}) {
  const db = useDb(options.db);
  const row = await findRowById(db, userId, id);
  if (!row) return null;

  if (row.is_password_protected !== true) {
    return mapNoteDetail(row, { includeContent: true });
  }

  const ok = await verifyPassword(password, row.password_hash, row.password_salt);
  if (!ok) throw serviceError('Invalid note password', 'NOTE_PASSWORD_INVALID', 401);
  return mapNoteDetail(row, { includeContent: true });
}

async function update(userId, id, patch, options = {}) {
  const db = useDb(options.db);
  const existingRow = await findRowById(db, userId, id);
  if (!existingRow) return null;

  const fields = [];
  const params = [];
  let i = 1;

  if (patch.title !== undefined) {
    const title = String(patch.title || '').trim();
    if (!title) throw serviceError('Title is required', 'NOTE_TITLE_REQUIRED', 400);
    if (title.length > 200) throw serviceError('Title exceeds max length 200', 'NOTE_TITLE_TOO_LONG', 400);
    fields.push(`title = $${i++}`);
    params.push(title);
  }

  if (patch.content !== undefined) {
    const content = normalizeContent(patch.content);
    fields.push(`content_json = $${i++}`);
    params.push(content);
  }

  if (patch.passwordProtection) {
    const setting = patch.passwordProtection;
    if (setting.enabled === true) {
      assertPassword(setting.password);
      const generated = await hashPassword(setting.password);
      fields.push(`is_password_protected = $${i++}`);
      params.push(true);
      fields.push(`password_hash = $${i++}`);
      params.push(generated.hash);
      fields.push(`password_salt = $${i++}`);
      params.push(generated.salt);
      fields.push(`password_updated_at = $${i++}`);
      params.push(new Date());
    } else if (setting.enabled === false) {
      if (existingRow.is_password_protected === true) {
        if (!setting.currentPassword) {
          throw serviceError('Current password is required to disable protection', 'NOTE_PASSWORD_REQUIRED', 400);
        }
        const ok = await verifyPassword(setting.currentPassword, existingRow.password_hash, existingRow.password_salt);
        if (!ok) throw serviceError('Invalid note password', 'NOTE_PASSWORD_INVALID', 401);
      }
      fields.push(`is_password_protected = $${i++}`);
      params.push(false);
      fields.push(`password_hash = $${i++}`);
      params.push(null);
      fields.push(`password_salt = $${i++}`);
      params.push(null);
      fields.push(`password_updated_at = $${i++}`);
      params.push(null);
    }
  }

  if (!fields.length) {
    return mapNoteDetail(existingRow, { includeContent: true });
  }

  fields.push('updated_at = NOW()');
  params.push(id, userId);
  await db.query(
    `UPDATE notes SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i}`,
    params
  );

  const updated = await findRowById(db, userId, id);
  return updated ? mapNoteDetail(updated, { includeContent: true }) : null;
}

async function remove(userId, id, options = {}) {
  const db = useDb(options.db);
  const force = options.force === true;
  const linkRes = await db.query(
    'SELECT COUNT(*)::int AS count FROM note_task_links WHERE user_id = $1 AND note_id = $2',
    [userId, id]
  );
  const linkCount = Number(linkRes.rows[0]?.count || 0);
  if (linkCount > 0 && !force) {
    throw serviceError('Note is linked to tasks', 'NOTE_LINKED', 409, { linkCount });
  }

  const { rowCount } = await db.query('DELETE FROM notes WHERE id = $1 AND user_id = $2', [id, userId]);
  if (rowCount === 0) return null;
  return { deleted: true, unlinkedCount: linkCount };
}

async function assertUserOwnsNotes(userId, noteIds, options = {}) {
  if (!noteIds.length) return [];
  const db = useDb(options.db);
  const { rows } = await db.query('SELECT id FROM notes WHERE user_id = $1 AND id = ANY($2::bigint[])', [userId, noteIds]);
  const owned = new Set(rows.map((r) => Number(r.id)));
  const missing = noteIds.filter((id) => !owned.has(Number(id)));
  if (missing.length) {
    throw serviceError('One or more notes do not exist', 'NOTE_NOT_FOUND', 404, { missingNoteIds: missing });
  }
  return Array.from(owned);
}

async function createForTodo(userId, noteInput, options = {}) {
  const created = await create(userId, noteInput, options);
  return created.id;
}

async function syncTaskLinks(userId, taskId, noteIds, options = {}) {
  const db = useDb(options.db);
  const unique = Array.from(new Set((noteIds || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)));
  await assertUserOwnsNotes(userId, unique, { db });

  if (unique.length === 0) {
    await db.query('DELETE FROM note_task_links WHERE user_id = $1 AND task_id = $2', [userId, taskId]);
    return [];
  }

  await db.query(
    `
    DELETE FROM note_task_links
    WHERE user_id = $1
      AND task_id = $2
      AND note_id <> ALL($3::bigint[])
    `,
    [userId, taskId, unique]
  );

  for (const noteId of unique) {
    await db.query(
      `
      INSERT INTO note_task_links (user_id, note_id, task_id, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, note_id, task_id) DO NOTHING
      `,
      [userId, noteId, taskId]
    );
  }

  return unique;
}

async function listLinksForTaskIds(userId, taskIds, options = {}) {
  const db = useDb(options.db);
  if (!Array.isArray(taskIds) || taskIds.length === 0) return new Map();
  const normalized = Array.from(new Set(taskIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
  if (!normalized.length) return new Map();

  const { rows } = await db.query(
    `
    SELECT
      l.task_id,
      n.id,
      n.title,
      n.is_password_protected
    FROM note_task_links l
    INNER JOIN notes n
      ON n.id = l.note_id
     AND n.user_id = l.user_id
    WHERE l.user_id = $1
      AND l.task_id = ANY($2::int[])
    ORDER BY l.task_id ASC, l.created_at ASC
    `,
    [userId, normalized]
  );

  const map = new Map();
  for (const row of rows) {
    const taskId = Number(row.task_id);
    const bucket = map.get(taskId) || [];
    bucket.push({
      id: Number(row.id),
      title: row.title,
      isPasswordProtected: row.is_password_protected === true,
    });
    map.set(taskId, bucket);
  }
  return map;
}

module.exports = {
  serviceError,
  list,
  getViewPreference,
  setViewPreference,
  findById,
  create,
  openProtected,
  update,
  remove,
  createForTodo,
  syncTaskLinks,
  listLinksForTaskIds,
};

