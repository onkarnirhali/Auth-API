'use strict';

const providerLinks = require('../../models/providerLinkModel');
const gmailTokens = require('../../models/gmailTokenModel');
const outlookTokens = require('../../models/outlookTokenModel');

const SUPPORTED_PROVIDERS = ['gmail', 'outlook'];
const RECONNECT_METADATA_KEYS = ['reconnectRequired', 'reconnectReason', 'reconnectRequiredAt'];

function normalizeProvider(provider) {
  const value = String(provider || '').trim().toLowerCase();
  if (!SUPPORTED_PROVIDERS.includes(value)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return value;
}

function buildPolicyDefaults(provider) {
  return {
    provider,
    linked: false,
    ingestEnabled: false,
    lastLinkedAt: null,
    lastSyncAt: null,
    metadata: {},
  };
}

function toPolicy(link) {
  return {
    provider: normalizeProvider(link.provider),
    linked: Boolean(link.linked),
    ingestEnabled: Boolean(link.ingestEnabled),
    lastLinkedAt: link.lastLinkedAt || null,
    lastSyncAt: link.lastSyncAt || null,
    metadata: link.metadata || {},
  };
}

function sortPolicies(policies) {
  return [...policies].sort((a, b) => SUPPORTED_PROVIDERS.indexOf(a.provider) - SUPPORTED_PROVIDERS.indexOf(b.provider));
}

function mergeMetadata(currentMetadata, overrides, options = {}) {
  const merged = {
    ...(currentMetadata || {}),
    ...(overrides || {}),
  };

  const removeKeys = new Set(Array.isArray(options.removeMetadataKeys) ? options.removeMetadataKeys : []);
  if (options.clearReconnectMetadata) {
    for (const key of RECONNECT_METADATA_KEYS) removeKeys.add(key);
  }
  for (const key of removeKeys) {
    delete merged[key];
  }
  return merged;
}

function shouldBackfillFromToken(policy) {
  if (!policy) return true;
  if (policy.linked || policy.ingestEnabled) return false;
  // Do not override explicit disconnects where the user had previously linked.
  // Placeholder rows created by bootstrap have lastLinkedAt = null.
  return !policy.lastLinkedAt;
}

async function reconcilePoliciesWithTokens(userId, policies) {
  const map = new Map((policies || []).map((policy) => [policy.provider, policy]));
  const [gmailToken, outlookToken] = await Promise.all([
    gmailTokens.findByUserId(userId).catch(() => null),
    outlookTokens.findByUserId(userId).catch(() => null),
  ]);

  const gmailPolicy = map.get('gmail') || buildPolicyDefaults('gmail');
  if (gmailToken && shouldBackfillFromToken(gmailPolicy)) {
    const updated = await providerLinks.upsertLink({
      userId,
      provider: 'gmail',
      linked: true,
      ingestEnabled: true,
      metadata: {
        ...(gmailPolicy.metadata || {}),
        scope: gmailToken.scope || null,
      },
      lastLinkedAt: new Date(),
      lastSyncAt: gmailPolicy.lastSyncAt || null,
    });
    map.set('gmail', toPolicy(updated));
  }

  const outlookPolicy = map.get('outlook') || buildPolicyDefaults('outlook');
  if (outlookToken && shouldBackfillFromToken(outlookPolicy)) {
    const updated = await providerLinks.upsertLink({
      userId,
      provider: 'outlook',
      linked: true,
      ingestEnabled: true,
      metadata: {
        ...(outlookPolicy.metadata || {}),
        accountEmail: outlookToken.accountEmail || null,
        tenantId: outlookToken.tenantId || null,
      },
      lastLinkedAt: outlookToken.updatedAt || new Date(),
      lastSyncAt: outlookPolicy.lastSyncAt || null,
    });
    map.set('outlook', toPolicy(updated));
  }

  return sortPolicies(Array.from(map.values()));
}

async function ensurePolicies(userId) {
  const existingLinks = await providerLinks.listByUser(userId);
  const map = new Map(existingLinks.map((link) => [normalizeProvider(link.provider), toPolicy(link)]));

  for (const provider of SUPPORTED_PROVIDERS) {
    if (!map.has(provider)) {
      const created = await providerLinks.upsertLink({
        userId,
        provider,
        linked: false,
        ingestEnabled: false,
        metadata: {},
        lastLinkedAt: null,
        lastSyncAt: null,
      });
      map.set(provider, toPolicy(created));
    }
  }

  return reconcilePoliciesWithTokens(userId, sortPolicies(Array.from(map.values())));
}

function findPolicy(policies, provider) {
  return policies.find((item) => item.provider === provider) || buildPolicyDefaults(provider);
}

function buildMode(gmailPolicy, outlookPolicy) {
  const gmailOn = Boolean(gmailPolicy.linked && gmailPolicy.ingestEnabled);
  const outlookOn = Boolean(outlookPolicy.linked && outlookPolicy.ingestEnabled);
  if (gmailOn && outlookOn) return 'both';
  if (gmailOn) return 'gmail_only';
  if (outlookOn) return 'outlook_only';
  return 'none';
}

function buildMatrixFromPolicies(policies) {
  const gmail = findPolicy(policies, 'gmail');
  const outlook = findPolicy(policies, 'outlook');
  return {
    gmail: {
      linked: gmail.linked,
      ingestEnabled: gmail.ingestEnabled,
    },
    outlook: {
      linked: outlook.linked,
      ingestEnabled: outlook.ingestEnabled,
    },
    mode: buildMode(gmail, outlook),
  };
}

async function listPolicies(userId) {
  return ensurePolicies(userId);
}

async function getProviderMatrix(userId) {
  const policies = await ensurePolicies(userId);
  return buildMatrixFromPolicies(policies);
}

async function connectProviderPolicy(userId, provider, options = {}) {
  const normalized = normalizeProvider(provider);
  const currentPolicies = await ensurePolicies(userId);
  const current = findPolicy(currentPolicies, normalized);

  const updated = await providerLinks.upsertLink({
    userId,
    provider: normalized,
    linked: true,
    ingestEnabled: true,
    metadata: mergeMetadata(current.metadata, options.metadata, { clearReconnectMetadata: true }),
    lastLinkedAt: options.lastLinkedAt || new Date(),
    lastSyncAt: current.lastSyncAt || null,
  });

  return toPolicy(updated);
}

async function disconnectProviderPolicy(userId, provider, options = {}) {
  const normalized = normalizeProvider(provider);
  const currentPolicies = await ensurePolicies(userId);
  const current = findPolicy(currentPolicies, normalized);

  const updated = await providerLinks.upsertLink({
    userId,
    provider: normalized,
    linked: false,
    ingestEnabled: false,
    metadata: mergeMetadata(current.metadata, options.metadata, {
      clearReconnectMetadata: Boolean(options.clearReconnectMetadata),
      removeMetadataKeys: options.removeMetadataKeys,
    }),
    lastLinkedAt: current.lastLinkedAt || null,
    lastSyncAt: current.lastSyncAt || null,
  });

  return toPolicy(updated);
}

async function toggleProviderIngestPolicy(userId, provider, ingestEnabled) {
  const normalized = normalizeProvider(provider);
  const currentPolicies = await ensurePolicies(userId);
  const current = findPolicy(currentPolicies, normalized);
  const nextIngest = Boolean(ingestEnabled);
  const nextLinked = nextIngest ? true : current.linked;

  const updated = await providerLinks.upsertLink({
    userId,
    provider: normalized,
    linked: nextLinked,
    ingestEnabled: nextIngest,
    metadata: mergeMetadata(current.metadata, null, { clearReconnectMetadata: nextIngest }),
    lastLinkedAt: nextLinked ? (current.lastLinkedAt || new Date()) : current.lastLinkedAt || null,
    lastSyncAt: current.lastSyncAt || null,
  });

  return toPolicy(updated);
}

function getAllowedEmailProviders(matrix) {
  if (!matrix) return [];
  if (matrix.mode === 'gmail_only') return ['gmail'];
  if (matrix.mode === 'outlook_only') return ['outlook'];
  if (matrix.mode === 'both') return ['gmail', 'outlook'];
  return [];
}

module.exports = {
  SUPPORTED_PROVIDERS,
  normalizeProvider,
  listPolicies,
  getProviderMatrix,
  connectProviderPolicy,
  disconnectProviderPolicy,
  toggleProviderIngestPolicy,
  getAllowedEmailProviders,
};
