'use strict';

const pool = require('../config/db');
const { AdminRepository } = require('../services/admin/adminRepository');
const { AdminService } = require('../services/admin/adminService');

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
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
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

async function getSummary(_req, res) {
  const data = await service.getSummary({ activeWindowHours: 24 });
  res.json(data);
}

async function listUsers(req, res) {
  const { limit, offset } = parsePagination(req.query);
  const { items, total } = await service.listUsers({ limit, offset });
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

module.exports = {
  getSummary,
  listUsers,
  listEvents,
  listIntegrations,
};
