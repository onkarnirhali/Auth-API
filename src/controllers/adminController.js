'use strict';

const pool = require('../config/db');
const tokens = require('../services/tokenService');
const { AdminRepository } = require('../services/admin/adminRepository');
const { AdminService } = require('../services/admin/adminService');
const { logEventSafe } = require('../services/eventService');

const repo = new AdminRepository(pool);
const service = new AdminService(repo);

function parsePagination(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return { limit, offset };
}

function mapUserRow(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    providerId: row.provider_id,
    providerName: row.provider_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActiveAt: row.last_active_at,
    isEnabled: row.is_enabled !== false,
    outlookAccountEmail: row.outlook_account_email || null,
    outlookTenantId: row.outlook_tenant_id || null,
    suggestionsGenerated: row.suggestions_generated || 0,
    suggestionsAccepted: row.suggestions_accepted || 0,
    tokensGeneration: row.tokens_generation || 0,
    tokensEmbedding: row.tokens_embedding || 0,
  };
}

function mapEventRow(row) {
  return {
    id: row.id,
    type: row.type,
    userId: row.user_id,
    email: row.email || null,
    requestId: row.request_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    source: row.source,
    metadata: row.metadata || null,
    createdAt: row.created_at,
  };
}

function mapIntegrationRow(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    gmailLinked: row.gmail_linked || false,
    gmailIngestEnabled: row.gmail_ingest_enabled || false,
    gmailLastLinkedAt: row.gmail_last_linked_at,
    outlookLinked: row.outlook_linked || false,
    outlookIngestEnabled: row.outlook_ingest_enabled || false,
    outlookLastLinkedAt: row.outlook_last_linked_at,
  };
}

function normalizeRole(value) {
  if (typeof value !== 'string') return null;
  const role = value.trim().toLowerCase();
  return role === 'admin' || role === 'user' ? role : null;
}

async function getSummary(_req, res) {
  const data = await service.getSummary({ activeWindowHours: 24 });
  res.json(data);
}

async function listUsers(req, res) {
  const { limit, offset } = parsePagination(req.query);
  const role = normalizeRole(req.query.role);
  const { items, total } = await service.listUsers({ limit, offset, role });
  res.json({ items: items.map(mapUserRow), total, limit, offset });
}

async function listEvents(req, res) {
  const { limit, offset } = parsePagination(req.query);
  const type = typeof req.query.type === 'string' ? req.query.type.trim() : null;
  const userId = req.query.userId ? Number(req.query.userId) : null;
  const { items, total } = await service.listEvents({ limit, offset, type, userId });
  res.json({ items: items.map(mapEventRow), total, limit, offset });
}

async function listIntegrations(req, res) {
  const { limit, offset } = parsePagination(req.query);
  const { items, total } = await service.listIntegrations({ limit, offset });
  res.json({ items: items.map(mapIntegrationRow), total, limit, offset });
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
