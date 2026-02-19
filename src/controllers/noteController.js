'use strict';

const notes = require('../services/noteService');
const { sendError } = require('../utils/http');
const { logEventSafe } = require('../services/eventService');

function parseId(raw) {
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

function maybeSendServiceError(req, res, err) {
  if (!err || !err.status) return false;
  const extra = err.details ? err.details : {};
  sendError(req, res, err.status, err.message || 'Request failed', err.code || 'NOTE_ERROR', extra);
  return true;
}

async function list(req, res) {
  try {
    const result = await notes.list(req.user.id, req.query);
    res.json(result);
  } catch (err) {
    if (!maybeSendServiceError(req, res, err)) throw err;
  }
}

async function create(req, res) {
  try {
    const item = await notes.create(req.user.id, req.body);
    await logEventSafe({
      type: 'note.created',
      userId: req.user.id,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      source: 'api',
      metadata: { noteId: item.id, protected: item.isPasswordProtected },
    });
    res.status(201).json({ item });
  } catch (err) {
    if (!maybeSendServiceError(req, res, err)) throw err;
  }
}

async function getById(req, res) {
  const id = parseId(req.params.id);
  if (!id) return sendError(req, res, 400, 'Invalid note id', 'NOTE_ID_INVALID');
  try {
    const item = await notes.findById(req.user.id, id);
    if (!item) return sendError(req, res, 404, 'Note not found', 'NOTE_NOT_FOUND');
    res.json({ item });
  } catch (err) {
    if (!maybeSendServiceError(req, res, err)) throw err;
  }
}

async function openProtected(req, res) {
  const id = parseId(req.params.id);
  if (!id) return sendError(req, res, 400, 'Invalid note id', 'NOTE_ID_INVALID');
  try {
    const item = await notes.openProtected(req.user.id, id, req.body.password);
    if (!item) return sendError(req, res, 404, 'Note not found', 'NOTE_NOT_FOUND');
    await logEventSafe({
      type: 'note.opened',
      userId: req.user.id,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      source: 'api',
      metadata: { noteId: id, protected: true },
    });
    res.json({ item });
  } catch (err) {
    if (!maybeSendServiceError(req, res, err)) throw err;
  }
}

async function update(req, res) {
  const id = parseId(req.params.id);
  if (!id) return sendError(req, res, 400, 'Invalid note id', 'NOTE_ID_INVALID');
  try {
    const item = await notes.update(req.user.id, id, req.body);
    if (!item) return sendError(req, res, 404, 'Note not found', 'NOTE_NOT_FOUND');
    await logEventSafe({
      type: 'note.updated',
      userId: req.user.id,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      source: 'api',
      metadata: { noteId: id, protected: item.isPasswordProtected },
    });
    res.json({ item });
  } catch (err) {
    if (!maybeSendServiceError(req, res, err)) throw err;
  }
}

async function destroy(req, res) {
  const id = parseId(req.params.id);
  if (!id) return sendError(req, res, 400, 'Invalid note id', 'NOTE_ID_INVALID');
  const force = ['1', 'true', 'yes'].includes(String(req.query.force || '').toLowerCase());
  try {
    const deleted = await notes.remove(req.user.id, id, { force });
    if (!deleted) return sendError(req, res, 404, 'Note not found', 'NOTE_NOT_FOUND');
    await logEventSafe({
      type: 'note.deleted',
      userId: req.user.id,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      source: 'api',
      metadata: { noteId: id, unlinkedCount: deleted.unlinkedCount || 0 },
    });
    res.json(deleted);
  } catch (err) {
    if (!maybeSendServiceError(req, res, err)) throw err;
  }
}

async function updatePreferences(req, res) {
  try {
    const viewMode = await notes.setViewPreference(req.user.id, req.body.viewMode);
    res.json({ viewMode });
  } catch (err) {
    if (!maybeSendServiceError(req, res, err)) throw err;
  }
}

module.exports = {
  list,
  create,
  getById,
  openProtected,
  update,
  destroy,
  updatePreferences,
};
