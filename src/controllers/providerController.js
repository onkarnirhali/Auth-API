'use strict';

const gmailTokens = require('../models/gmailTokenModel');
const providerLinks = require('../models/providerLinkModel');

const PROVIDER_DISPLAY = {
  gmail: 'Gmail',
  outlook: 'Outlook',
};

function toResponse(link) {
  return {
    provider: link.provider,
    displayName: PROVIDER_DISPLAY[link.provider] || link.provider,
    linked: !!link.linked,
    ingestEnabled: !!link.ingestEnabled,
    lastLinkedAt: link.lastLinkedAt,
    lastSyncAt: link.lastSyncAt,
  };
}

async function listProviders(req, res) {
  try {
    const userId = req.user.id;
    const links = await providerLinks.listByUser(userId);
    const gmailToken = await gmailTokens.findByUserId(userId);

    const hasGmail = links.find((l) => l.provider === 'gmail');
    const providers = [...links];

    if (!hasGmail && gmailToken) {
      // auto-create a gmail link if token exists
      const linked = await providerLinks.upsertLink({
        userId,
        provider: 'gmail',
        linked: true,
        ingestEnabled: true,
        metadata: { scope: gmailToken.scope || null },
        lastLinkedAt: new Date(),
      });
      providers.push(linked);
    }

    // Ensure gmail is at least present as disconnected
    if (!providers.find((p) => p.provider === 'gmail')) {
      providers.push({
        provider: 'gmail',
        linked: false,
        ingestEnabled: false,
        lastLinkedAt: null,
        lastSyncAt: null,
      });
    }
    // Add outlook placeholder if missing
    if (!providers.find((p) => p.provider === 'outlook')) {
      providers.push({
        provider: 'outlook',
        linked: false,
        ingestEnabled: false,
        lastLinkedAt: null,
        lastSyncAt: null,
      });
    }

    res.json({ providers: providers.map(toResponse) });
  } catch (err) {
    console.error('Failed to list providers', err);
    res.status(500).json({ error: 'Failed to list providers' });
  }
}

async function connectProvider(req, res) {
  const provider = (req.params.provider || '').toLowerCase();
  if (!provider) return res.status(400).json({ error: 'provider is required' });
  try {
    const linked = await providerLinks.upsertLink({
      userId: req.user.id,
      provider,
      linked: true,
      ingestEnabled: true,
      lastLinkedAt: new Date(),
    });
    res.json({ provider: toResponse(linked) });
  } catch (err) {
    console.error('Failed to connect provider', err);
    res.status(500).json({ error: 'Failed to connect provider' });
  }
}

async function disconnectProvider(req, res) {
  const provider = (req.params.provider || '').toLowerCase();
  if (!provider) return res.status(400).json({ error: 'provider is required' });
  try {
    const linked = await providerLinks.upsertLink({
      userId: req.user.id,
      provider,
      linked: false,
      ingestEnabled: false,
    });
    res.json({ provider: toResponse(linked) });
  } catch (err) {
    console.error('Failed to disconnect provider', err);
    res.status(500).json({ error: 'Failed to disconnect provider' });
  }
}

async function toggleIngest(req, res) {
  const provider = (req.params.provider || '').toLowerCase();
  const ingestEnabled = !!req.body?.ingestEnabled;
  if (!provider) return res.status(400).json({ error: 'provider is required' });
  try {
    // ensure row exists
    await providerLinks.upsertLink({
      userId: req.user.id,
      provider,
      linked: true,
      ingestEnabled,
    });
    const updated = await providerLinks.updateIngest(req.user.id, provider, ingestEnabled);
    res.json({ provider: updated ? toResponse(updated) : null });
  } catch (err) {
    console.error('Failed to toggle provider ingest', err);
    res.status(500).json({ error: 'Failed to toggle provider ingest' });
  }
}

module.exports = {
  listProviders,
  connectProvider,
  disconnectProvider,
  toggleIngest,
};
