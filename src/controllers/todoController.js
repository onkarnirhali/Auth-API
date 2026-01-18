const todos = require('../services/todoService');
const { sendError } = require('../utils/http');

// CRUD handlers for user-owned todos (service layer handles DB + ownership)
async function list(req, res) {
  const items = await todos.list(req.user.id, req.query);
  res.json({ items });
}

async function create(req, res) {
  const { title, description, status, priority, dueDate } = req.body;
  const item = await todos.create(req.user.id, { title, description, status, priority, dueDate });
  res.status(201).json({ item });
}

async function update(req, res) {
  const id = Number(req.params.id);
  const patch = req.body || {};
  const normalized = {
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.dueDate !== undefined ? { due_date: patch.dueDate } : {}),
  };
  const item = await todos.update(req.user.id, id, normalized);
  if (!item) return sendError(req, res, 404, 'Todo not found', 'TODO_NOT_FOUND');
  res.json({ item });
}

async function destroy(req, res) {
  const id = Number(req.params.id);
  await todos.remove(req.user.id, id);
  res.status(204).send();
}

module.exports = { list, create, update, destroy };
