'use strict';

const pool = require('../config/db');
const tokens = require('../services/tokenService');
const { AdminRepository } = require('../services/admin/adminRepository');
const { AdminService } = require('../services/admin/adminService');
const { logEventSafe } = require('../services/eventService');
const { parsePagination } = require('../utils/pagination');
const { normalizeRole } = require('../utils/roles');
const { mapAdminUserRow, mapAdminEventRow, mapAdminIntegrationRow } = require('../utils/adminMappers');

const repo = new AdminRepository(pool);
const service = new AdminService(repo);

async function getSummary(_req, res) {
  const data = await service.getSummary({ activeWindowHours: 24 });
  res.json(data);
}

async function listUsers(req, res) {
  const { limit, offset } = parsePagination(req.query);
  const role = normalizeRole(req.query.role);
  const { items, total } = await service.listUsers({ limit, offset, role });
  res.json({ items: items.map(mapAdminUserRow), total, limit, offset });
}

async function listEvents(req, res) {
  const { limit, offset } = parsePagination(req.query);
  const type = typeof req.query.type === 'string' ? req.query.type.trim() : null;
  const userId = req.query.userId ? Number(req.query.userId) : null;
  const { items, total } = await service.listEvents({ limit, offset, type, userId });
  res.json({ items: items.map(mapAdminEventRow), total, limit, offset });
}

async function listIntegrations(req, res) {
  const { limit, offset } = parsePagination(req.query);
  const { items, total } = await service.listIntegrations({ limit, offset });
  res.json({ items: items.map(mapAdminIntegrationRow), total, limit, offset });
}

async function updateUser(req, res) {
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId)) {
    return res.status(400).json({ error: { message: 'Invalid user id' } });
  }

  const body = req.body || {};
  let role;
  let isEnabled;

  if (Object.prototype.hasOwnProperty.call(body, 'role')) {
    role = normalizeRole(body.role);
    if (!role) {
      return res.status(400).json({ error: { message: 'Invalid role' } });
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'isEnabled')) {
    if (typeof body.isEnabled !== 'boolean') {
      return res.status(400).json({ error: { message: 'isEnabled must be a boolean' } });
    }
    isEnabled = body.isEnabled;
  }

  if (typeof role === 'undefined' && typeof isEnabled === 'undefined') {
    return res.status(400).json({ error: { message: 'No changes provided' } });
  }

  if (req.user && req.user.id === userId) {
    if (role && role !== 'admin') {
      return res.status(400).json({ error: { message: 'Admins cannot remove their own admin role' } });
    }
    if (isEnabled === false) {
      return res.status(400).json({ error: { message: 'Admins cannot disable themselves' } });
    }
  }

  const updated = await service.updateUserFlags({ id: userId, role, isEnabled });
  if (!updated) {
    return res.status(404).json({ error: { message: 'User not found' } });
  }

  if (isEnabled === false) {
    try { await tokens.revokeAllUserTokens(userId); } catch (_) {}
  }

  await logEventSafe({
    type: 'admin.user.updated',
    userId: req.user?.id || null,
    requestId: req.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    source: 'admin',
    metadata: { targetUserId: userId, role, isEnabled },
  });

  return res.json({ success: true });
}

module.exports = {
  getSummary,
  listUsers,
  listEvents,
  listIntegrations,
  updateUser,
};
