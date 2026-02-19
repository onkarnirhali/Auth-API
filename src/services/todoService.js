const pool = require('../config/db');
const notes = require('./noteService');

const mapTodo = (row, linkedNotes = []) => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  description: row.description,
  status: row.status,
  priority: row.priority,
  dueDate: row.due_date,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  linkedNotes,
});

function useDb(client) {
  return client || pool;
}

async function getLinkedNotesMap(userId, todoIds, options = {}) {
  return notes.listLinksForTaskIds(userId, todoIds, { db: useDb(options.db) });
}

async function list(userId, { status, q, dueFrom, dueTo } = {}, options = {}) {
  const db = useDb(options.db);
  // Build dynamic filters per user; ILIKE enables case-insensitive text search
  const clauses = ['user_id = $1'];
  const params = [userId];
  let i = params.length + 1;
  if (status) { clauses.push(`status = $${i++}`); params.push(status); }
  if (q) { clauses.push(`(title ILIKE $${i} OR description ILIKE $${i})`); params.push(`%${q}%`); i++; }
  if (dueFrom) { clauses.push(`due_date >= $${i++}`); params.push(dueFrom); }
  if (dueTo) { clauses.push(`due_date <= $${i++}`); params.push(dueTo); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await db.query(`SELECT * FROM todos ${where} ORDER BY created_at DESC`, params);
  const todoIds = rows.map((row) => Number(row.id));
  const linkedMap = await getLinkedNotesMap(userId, todoIds, { db });
  return rows.map((row) => mapTodo(row, linkedMap.get(Number(row.id)) || []));
}

async function create(userId, { title, description, status = 'pending', priority = 'normal', dueDate = null }, options = {}) {
  const db = useDb(options.db);
  const now = new Date();
  const { rows } = await db.query(
    `INSERT INTO todos (user_id, title, description, status, priority, due_date, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [userId, title, description || null, status, priority, dueDate, now, now]
  );
  return mapTodo(rows[0]);
}

async function findById(userId, id, options = {}) {
  const db = useDb(options.db);
  const { rows } = await db.query(`SELECT * FROM todos WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!rows[0]) return null;
  const linkedMap = await getLinkedNotesMap(userId, [Number(id)], { db });
  return mapTodo(rows[0], linkedMap.get(Number(id)) || []);
}

async function update(userId, id, patch, options = {}) {
  const db = useDb(options.db);
  const fields = [];
  const params = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    if (['title', 'description', 'status', 'priority', 'due_date'].includes(k)) {
      fields.push(`${k} = $${i++}`);
      params.push(v);
    }
  }
  if (!fields.length) return findById(userId, id, { db });
  fields.push(`updated_at = NOW()`);
  params.push(id, userId);
  const { rows } = await db.query(
    `UPDATE todos SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
    params
  );
  if (!rows[0]) return null;
  const linkedMap = await getLinkedNotesMap(userId, [Number(id)], { db });
  return mapTodo(rows[0], linkedMap.get(Number(id)) || []);
}

async function remove(userId, id) {
  await pool.query(`DELETE FROM todos WHERE id = $1 AND user_id = $2`, [id, userId]);
}

function normalizeNotePayload(rawNotes) {
  if (!rawNotes || typeof rawNotes !== 'object') return null;
  const linkedNoteIds = Array.from(
    new Set((rawNotes.linkedNoteIds || []).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0))
  );
  const newNotes = Array.isArray(rawNotes.newNotes) ? rawNotes.newNotes : [];
  return { linkedNoteIds, newNotes };
}

async function applyTodoNotesPayload(db, userId, taskId, rawNotes) {
  const payload = normalizeNotePayload(rawNotes);
  if (!payload) return;

  const createdIds = [];
  for (const noteInput of payload.newNotes) {
    const createdId = await notes.createForTodo(userId, noteInput, { db });
    createdIds.push(createdId);
  }

  const finalIds = Array.from(new Set([...payload.linkedNoteIds, ...createdIds]));
  await notes.syncTaskLinks(userId, taskId, finalIds, { db });
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

async function createWithNotes(userId, payload) {
  return withTransaction(async (client) => {
    const item = await create(userId, payload, { db: client });
    await applyTodoNotesPayload(client, userId, item.id, payload.notes);
    return findById(userId, item.id, { db: client });
  });
}

async function updateWithNotes(userId, id, patch, notePayload) {
  return withTransaction(async (client) => {
    const item = await update(userId, id, patch, { db: client });
    if (!item) return null;
    await applyTodoNotesPayload(client, userId, id, notePayload);
    return findById(userId, id, { db: client });
  });
}

module.exports = {
  list,
  create,
  createWithNotes,
  findById,
  update,
  updateWithNotes,
  remove,
};

