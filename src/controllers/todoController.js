const todos = require('../services/todoService');
const { sendError } = require('../utils/http');
const { logEventSafe } = require('../services/eventService');

const REORDER_LANES = ['todo', 'in_progress', 'done'];

function normalizeReorderPayload(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: [{ path: 'lanes', message: 'must be an object' }] };
  }
  const lanes = body.lanes;
  if (!lanes || typeof lanes !== 'object' || Array.isArray(lanes)) {
    return { errors: [{ path: 'lanes', message: 'must be an object with todo, in_progress, and done arrays' }] };
  }

  const normalized = {};
  const ids = [];
  const allowed = new Set(REORDER_LANES);

  for (const key of Object.keys(lanes)) {
    if (!allowed.has(key)) {
      errors.push({ path: `lanes.${key}`, message: 'unknown lane' });
    }
  }

  for (const lane of REORDER_LANES) {
    const value = lanes[lane];
    if (!Array.isArray(value)) {
      errors.push({ path: `lanes.${lane}`, message: 'must be an array of todo ids' });
      continue;
    }
    const laneIds = [];
    value.forEach((rawId, index) => {
      const id = Number(rawId);
      if (!Number.isInteger(id) || id <= 0) {
        errors.push({ path: `lanes.${lane}[${index}]`, message: 'must be a positive integer' });
        return;
      }
      laneIds.push(id);
      ids.push(id);
    });
    normalized[lane] = laneIds;
  }

  const duplicates = [];
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  }
  if (duplicates.length) {
    errors.push({ path: 'lanes', message: 'each todo id must appear exactly once' });
  }

  return { errors, lanes: normalized, ids, duplicates };
}

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

async function reorder(req, res) {
  const parsed = normalizeReorderPayload(req.body);
  if (parsed.errors.length) {
    return sendError(req, res, 422, 'Validation failed', 'VALIDATION_ERROR', { details: parsed.errors });
  }

  const currentItems = await todos.list(req.user.id, {});
  const currentIds = currentItems.map((item) => item.id);
  const currentSet = new Set(currentIds);
  const providedIds = REORDER_LANES.flatMap((lane) => parsed.lanes[lane]);
  const providedSet = new Set(providedIds);

  const missingIds = currentIds.filter((id) => !providedSet.has(id));
  const extraIds = providedIds.filter((id) => !currentSet.has(id));
  if (missingIds.length || extraIds.length || parsed.duplicates.length) {
    const details = [];
    if (parsed.duplicates.length) {
      details.push({ path: 'lanes', message: 'each todo id must appear exactly once', duplicates: parsed.duplicates });
    }
    if (missingIds.length) {
      details.push({ path: 'lanes', message: `missing todo ids: ${missingIds.join(', ')}`, missingIds });
    }
    if (extraIds.length) {
      details.push({ path: 'lanes', message: `unknown todo ids: ${extraIds.join(', ')}`, extraIds });
    }
    return sendError(req, res, 422, 'Validation failed', 'VALIDATION_ERROR', { details });
  }

  try {
    const items = await todos.reorder(req.user.id, parsed.lanes);
    res.json({ items });
  } catch (err) {
    if (err && err.code === 'TODO_REORDER_INVALID') {
      return sendError(req, res, 422, 'Validation failed', 'VALIDATION_ERROR', {
        details: [{ path: 'lanes', message: err.message, ...(err.details || {}) }],
      });
    }
    throw err;
  }
}

async function destroy(req, res) {
  const id = Number(req.params.id);
  await todos.remove(req.user.id, id);
  res.status(204).send();
}

module.exports = { list, create, update, reorder, destroy };
