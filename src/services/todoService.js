const pool = require('../config/db');

const mapTodo = (row) => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  description: row.description,
  status: row.status,
  priority: row.priority,
  dueDate: row.due_date,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function list(userId, { status, q, dueFrom, dueTo } = {}) {
  // Build dynamic filters per user; ILIKE enables case-insensitive text search
  const clauses = ['user_id = $1'];
  const params = [userId];
  let i = params.length + 1;
  if (status) { clauses.push(`status = $${i++}`); params.push(status); }
  if (q) { clauses.push(`(title ILIKE $${i} OR description ILIKE $${i})`); params.push(`%${q}%`); i++; }
  if (dueFrom) { clauses.push(`due_date >= $${i++}`); params.push(dueFrom); }
  if (dueTo) { clauses.push(`due_date <= $${i++}`); params.push(dueTo); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM todos ${where} ORDER BY created_at DESC`, params);
  return rows.map(mapTodo);
}

async function create(userId, { title, description, status = 'pending', priority = 'normal', dueDate = null }) {
  const now = new Date();
  const { rows } = await pool.query(
    `INSERT INTO todos (user_id, title, description, status, priority, due_date, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [userId, title, description || null, status, priority, dueDate, now, now]
  );
  return mapTodo(rows[0]);
}

async function findById(userId, id) {
  const { rows } = await pool.query(`SELECT * FROM todos WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rows[0] ? mapTodo(rows[0]) : null;
}

async function update(userId, id, patch) {
  const fields = [];
  const params = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    if (['title', 'description', 'status', 'priority', 'due_date'].includes(k)) {
      fields.push(`${k} = $${i++}`);
      params.push(v);
    }
  }
  if (!fields.length) return findById(userId, id);
  fields.push(`updated_at = NOW()`);
  params.push(id, userId);
  const { rows } = await pool.query(
    `UPDATE todos SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
    params
  );
  return rows[0] ? mapTodo(rows[0]) : null;
}

async function remove(userId, id) {
  await pool.query(`DELETE FROM todos WHERE id = $1 AND user_id = $2`, [id, userId]);
}

module.exports = { list, create, findById, update, remove };

