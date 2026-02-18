'use strict';

const providerLinks = require('../../models/providerLinkModel');

const SUPPORTED_PROVIDERS = ['gmail', 'outlook'];

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

  return sortPolicies(Array.from(map.values()));
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
    metadata: {
      ...(current.metadata || {}),
      ...(options.metadata || {}),
    },
    lastLinkedAt: options.lastLinkedAt || new Date(),
    lastSyncAt: current.lastSyncAt || null,
  });

  return toPolicy(updated);
}

async function disconnectProviderPolicy(userId, provider) {
  const normalized = normalizeProvider(provider);
  const currentPolicies = await ensurePolicies(userId);
  const current = findPolicy(currentPolicies, normalized);

  const updated = await providerLinks.upsertLink({
    userId,
    provider: normalized,
    linked: false,
    ingestEnabled: false,
    metadata: current.metadata || {},
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
    metadata: current.metadata || {},
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
