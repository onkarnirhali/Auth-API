const pool = require('../config/db');
const notes = require('./noteService');

const TODO_STATUSES = ['todo', 'in_progress', 'done'];
const STATUS_ALIASES = {
  pending: 'in_progress',
};

function normalizeTodoStatus(status) {
  if (STATUS_ALIASES[status]) return STATUS_ALIASES[status];
  if (TODO_STATUSES.includes(status)) return status;
  return null;
}

const mapTodo = (row, linkedNotes = []) => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  description: row.description,
  status: normalizeTodoStatus(row.status) || row.status,
  priority: row.priority,
  dueDate: row.due_date,
  position: row.position,
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

async function lockUserTodos(db, userId) {
  await db.query('SELECT id FROM todos WHERE user_id = $1 FOR UPDATE', [userId]);
}

async function shiftLanePositions(db, userId, status, fromPosition, delta) {
  if (!delta) return;
  await db.query(
    `
    UPDATE todos
    SET position = position + $4,
        updated_at = NOW()
    WHERE user_id = $1
      AND status = $2
      AND position >= $3
    `,
    [userId, status, fromPosition, delta]
  );
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

async function list(userId, { status, q, dueFrom, dueTo } = {}, options = {}) {
  const db = useDb(options.db);
  const clauses = ['user_id = $1'];
  const params = [userId];
  let i = params.length + 1;
  const normalizedStatus = status ? normalizeTodoStatus(status) || status : null;

  if (normalizedStatus) {
    clauses.push(`status = $${i++}`);
    params.push(normalizedStatus);
  }
  if (q) {
    clauses.push(`(title ILIKE $${i} OR description ILIKE $${i})`);
    params.push(`%${q}%`);
    i++;
  }
  if (dueFrom) {
    clauses.push(`due_date >= $${i++}`);
    params.push(dueFrom);
  }
  if (dueTo) {
    clauses.push(`due_date <= $${i++}`);
    params.push(dueTo);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await db.query(
    `
    SELECT *
    FROM todos
    ${where}
    ORDER BY
      CASE
        WHEN status = 'todo' THEN 0
        WHEN status = 'in_progress' THEN 1
        WHEN status = 'pending' THEN 1
        WHEN status = 'done' THEN 2
        ELSE 3
      END,
      position ASC,
      created_at DESC,
      id DESC
    `,
    params
  );
  const todoIds = rows.map((row) => Number(row.id));
  const linkedMap = await getLinkedNotesMap(userId, todoIds, { db });
  return rows.map((row) => mapTodo(row, linkedMap.get(Number(row.id)) || []));
}

async function createInDb(db, userId, { title, description, status = 'todo', priority = 'normal', dueDate = null }) {
  const normalizedStatus = normalizeTodoStatus(status) || 'todo';
  const now = new Date();

  await lockUserTodos(db, userId);
  await shiftLanePositions(db, userId, normalizedStatus, 1, 1);

  const { rows } = await db.query(
    `INSERT INTO todos (user_id, title, description, status, priority, due_date, position, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [userId, title, description || null, normalizedStatus, priority, dueDate, 1, now, now]
  );
  return mapTodo(rows[0]);
}

async function create(userId, payload, options = {}) {
  const db = useDb(options.db);
  if (options.db) {
    return createInDb(db, userId, payload);
  }
  return withTransaction((client) => createInDb(client, userId, payload));
}

async function findById(userId, id, options = {}) {
  const db = useDb(options.db);
  const { rows } = await db.query(`SELECT * FROM todos WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!rows[0]) return null;
  const linkedMap = await getLinkedNotesMap(userId, [Number(id)], { db });
  return mapTodo(rows[0], linkedMap.get(Number(id)) || []);
}

async function updateInDb(db, userId, id, patch) {
  await lockUserTodos(db, userId);

  const currentRes = await db.query(
    `SELECT * FROM todos WHERE id = $1 AND user_id = $2 FOR UPDATE`,
    [id, userId]
  );
  const current = currentRes.rows[0];
  if (!current) return null;

  const currentStatus = normalizeTodoStatus(current.status) || current.status;
  const nextStatus = patch.status !== undefined ? normalizeTodoStatus(patch.status) || currentStatus : currentStatus;
  const changingStatus = nextStatus !== currentStatus;
  const hasFieldChanges =
    patch.title !== undefined ||
    patch.description !== undefined ||
    patch.priority !== undefined ||
    patch.due_date !== undefined;

  if (!hasFieldChanges && !changingStatus && current.status === nextStatus) {
    const linkedMap = await getLinkedNotesMap(userId, [Number(id)], { db });
    return mapTodo(current, linkedMap.get(Number(id)) || []);
  }

  const fields = [];
  const params = [];
  let i = 1;

  if (patch.title !== undefined) {
    fields.push(`title = $${i++}`);
    params.push(patch.title);
  }
  if (patch.description !== undefined) {
    fields.push(`description = $${i++}`);
    params.push(patch.description);
  }
  if (patch.priority !== undefined) {
    fields.push(`priority = $${i++}`);
    params.push(patch.priority);
  }
  if (patch.due_date !== undefined) {
    fields.push(`due_date = $${i++}`);
    params.push(patch.due_date);
  }

  fields.push(`status = $${i++}`);
  params.push(nextStatus);

  if (changingStatus) {
    await shiftLanePositions(db, userId, currentStatus, Number(current.position) + 1, -1);
    await shiftLanePositions(db, userId, nextStatus, 1, 1);
    fields.push(`position = $${i++}`);
    params.push(1);
  }

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

async function update(userId, id, patch, options = {}) {
  const db = useDb(options.db);
  if (options.db) {
    return updateInDb(db, userId, id, patch);
  }
  return withTransaction((client) => updateInDb(client, userId, id, patch));
}

async function removeInDb(db, userId, id) {
  await lockUserTodos(db, userId);

  const currentRes = await db.query(
    `SELECT * FROM todos WHERE id = $1 AND user_id = $2 FOR UPDATE`,
    [id, userId]
  );
  const current = currentRes.rows[0];
  if (!current) return;

  const currentStatus = normalizeTodoStatus(current.status) || current.status;
  await db.query(`DELETE FROM todos WHERE id = $1 AND user_id = $2`, [id, userId]);
  await shiftLanePositions(db, userId, currentStatus, Number(current.position) + 1, -1);
}

async function reorderInDb(db, userId, lanes) {
  await lockUserTodos(db, userId);

  const currentRes = await db.query(
    `SELECT id FROM todos WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );
  const currentIds = currentRes.rows.map((row) => Number(row.id));
  const providedIds = TODO_STATUSES.flatMap((status) =>
    Array.isArray(lanes?.[status])
      ? lanes[status]
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      : []
  );
  const currentSet = new Set(currentIds);
  const providedSet = new Set();
  const duplicates = [];

  for (const id of providedIds) {
    if (providedSet.has(id)) {
      duplicates.push(id);
    }
    providedSet.add(id);
  }

  const missingIds = currentIds.filter((id) => !providedSet.has(id));
  const extraIds = providedIds.filter((id) => !currentSet.has(id));
  if (duplicates.length || missingIds.length || extraIds.length) {
    const err = new Error('Todo reorder payload does not match current board');
    err.code = 'TODO_REORDER_INVALID';
    err.details = { duplicates, missingIds, extraIds };
    throw err;
  }

  for (const status of TODO_STATUSES) {
    const ids = lanes[status] || [];
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      const result = await db.query(
        `
        UPDATE todos
        SET status = $1,
            position = $2,
            updated_at = NOW()
        WHERE user_id = $3 AND id = $4
        `,
        [status, index + 1, userId, id]
      );
      if (result.rowCount !== 1) {
        const err = new Error('Todo reorder payload does not match current board');
        err.code = 'TODO_REORDER_INVALID';
        err.details = { duplicates: [], missingIds, extraIds };
        throw err;
      }
    }
  }

  return list(userId, {}, { db });
}

async function remove(userId, id, options = {}) {
  const db = useDb(options.db);
  if (options.db) {
    return removeInDb(db, userId, id);
  }
  return withTransaction((client) => removeInDb(client, userId, id));
}

async function reorder(userId, lanes, options = {}) {
  const db = useDb(options.db);
  if (options.db) {
    return reorderInDb(db, userId, lanes);
  }
  return withTransaction((client) => reorderInDb(client, userId, lanes));
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
  reorder,
  normalizeTodoStatus,
};

