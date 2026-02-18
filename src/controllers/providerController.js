'use strict';

const gmailTokens = require('../models/gmailTokenModel');
const outlookTokens = require('../models/outlookTokenModel');
const { logEventSafe } = require('../services/eventService');
const {
  listPolicies,
  connectProviderPolicy,
  disconnectProviderPolicy,
  toggleProviderIngestPolicy,
  normalizeProvider,
} = require('../services/providerConnection/providerConnectionService');

const PROVIDER_DISPLAY = {
  gmail: 'Gmail',
  outlook: 'Outlook',
};

function toResponse(policy) {
  return {
    provider: policy.provider,
    displayName: PROVIDER_DISPLAY[policy.provider] || policy.provider,
    linked: Boolean(policy.linked),
    ingestEnabled: Boolean(policy.ingestEnabled),
    lastLinkedAt: policy.lastLinkedAt || null,
    lastSyncAt: policy.lastSyncAt || null,
    metadata: policy.metadata || {},
  };
}

async function listProviders(req, res) {
  try {
    const policies = await listPolicies(req.user.id);
    res.json({ providers: policies.map(toResponse) });
  } catch (err) {
    console.error('Failed to list providers', err);
    res.status(500).json({ error: 'Failed to list providers' });
  }
}

async function connectProvider(req, res) {
  const provider = (req.params.provider || '').toLowerCase();
  if (!provider) return res.status(400).json({ error: 'provider is required' });
  try {
    const updated = await connectProviderPolicy(req.user.id, provider, { lastLinkedAt: new Date() });
    await logEventSafe({
      type: 'provider.connected',
      userId: req.user.id,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      source: 'api',
      metadata: {
        provider: normalizeProvider(provider),
        ingestEnabled: updated.ingestEnabled,
      },
    });
    res.json({ provider: toResponse(updated) });
  } catch (err) {
    console.error('Failed to connect provider', err);
    const isValidation = /Unsupported provider/i.test(err?.message || '');
    res.status(isValidation ? 400 : 500).json({ error: isValidation ? err.message : 'Failed to connect provider' });
  }
}

async function disconnectProvider(req, res) {
  const provider = (req.params.provider || '').toLowerCase();
  if (!provider) return res.status(400).json({ error: 'provider is required' });
  try {
    const normalized = normalizeProvider(provider);
    if (normalized === 'outlook') {
      try {
        await outlookTokens.removeByUserId(req.user.id);
      } catch (_) {}
    }
    if (normalized === 'gmail') {
      try {
        await gmailTokens.removeByUserId(req.user.id);
      } catch (_) {}
    }
    const updated = await disconnectProviderPolicy(req.user.id, normalized);
    await logEventSafe({
      type: 'provider.disconnected',
      userId: req.user.id,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      source: 'api',
      metadata: {
        provider: normalized,
        ingestEnabled: updated.ingestEnabled,
      },
    });
    res.json({ provider: toResponse(updated) });
  } catch (err) {
    console.error('Failed to disconnect provider', err);
    const isValidation = /Unsupported provider/i.test(err?.message || '');
    res.status(isValidation ? 400 : 500).json({ error: isValidation ? err.message : 'Failed to disconnect provider' });
  }
}

async function toggleIngest(req, res) {
  const provider = (req.params.provider || '').toLowerCase();
  const ingestEnabled = !!req.body?.ingestEnabled;
  if (!provider) return res.status(400).json({ error: 'provider is required' });
  try {
    const updated = await toggleProviderIngestPolicy(req.user.id, provider, ingestEnabled);
    await logEventSafe({
      type: 'provider.ingest.toggled',
      userId: req.user.id,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      source: 'api',
      metadata: {
        provider: normalizeProvider(provider),
        ingestEnabled: updated.ingestEnabled,
        linked: updated.linked,
      },
    });
    res.json({ provider: toResponse(updated) });
  } catch (err) {
    console.error('Failed to toggle provider ingest', err);
    const isValidation = /Unsupported provider/i.test(err?.message || '');
    res.status(isValidation ? 400 : 500).json({ error: isValidation ? err.message : 'Failed to toggle provider ingest' });
  }
}

module.exports = {
  listProviders,
  connectProvider,
  disconnectProvider,
  toggleIngest,
};
