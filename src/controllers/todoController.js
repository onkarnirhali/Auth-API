const todos = require('../services/todoService');
const { sendError } = require('../utils/http');
const { logEventSafe } = require('../services/eventService');

// CRUD handlers for user-owned todos (service layer handles DB + ownership)
async function list(req, res) {
  const items = await todos.list(req.user.id, req.query);
  res.json({ items });
}

async function create(req, res) {
  const { title, description, status, priority, dueDate, notes } = req.body;
  const item = notes
    ? await todos.createWithNotes(req.user.id, { title, description, status, priority, dueDate, notes })
    : await todos.create(req.user.id, { title, description, status, priority, dueDate });
  await logEventSafe({
    type: 'todo.created',
    userId: req.user.id,
    requestId: req.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    source: 'api',
    metadata: { todoId: item.id, status: item.status },
  });
  res.status(201).json({ item });
}

async function update(req, res) {
  const id = Number(req.params.id);
  const patch = req.body || {};
  const before = await todos.findById(req.user.id, id);
  const normalized = {
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.dueDate !== undefined ? { due_date: patch.dueDate } : {}),
  };
  const item = patch.notes
    ? await todos.updateWithNotes(req.user.id, id, normalized, patch.notes)
    : await todos.update(req.user.id, id, normalized);
  if (!item) return sendError(req, res, 404, 'Todo not found', 'TODO_NOT_FOUND');
  if (before && before.status !== 'done' && item.status === 'done') {
    await logEventSafe({
      type: 'todo.completed',
      userId: req.user.id,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      source: 'api',
      metadata: { todoId: item.id },
    });
  }
  res.json({ item });
}

async function destroy(req, res) {
  const id = Number(req.params.id);
  await todos.remove(req.user.id, id);
  res.status(204).send();
}

module.exports = { list, create, update, destroy };
