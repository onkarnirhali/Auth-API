'use strict';

const { rephraseDescription } = require('../services/ai/textService');
const { AiProviderError } = require('../services/ai/errors');
const aiSuggestions = require('../models/aiSuggestionModel');
const { refreshSuggestionsForUser } = require('../services/suggestions/suggestionPipeline');
const { enrichSuggestionSource, enrichSuggestionsWithSource } = require('../services/suggestions/suggestionSource');
const { logEventSafe } = require('../services/eventService');

// Rephrase a todo description using the configured LLM provider
async function rephrase(req, res) {
  try {
    const { description } = req.body || {};
    const rephrased = await rephraseDescription(description, {
      userId: req.user.id,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      source: 'api',
    });
    res.json({ rephrased });
  } catch (err) {
    if (err instanceof AiProviderError) {
      const status = err.code === 'DESCRIPTION_REQUIRED' ? 400 : 502;
      return res.status(status).json({ error: err.message, code: err.code });
    }
    console.error('Unexpected AI rephrase error', err);
    res.status(500).json({ error: 'Failed to rephrase description' });
  }
}

// List cached AI suggestions for the current user (no regeneration)
async function listSuggestions(req, res) {
  try {
    const suggestions = await aiSuggestions.listByUser(req.user.id, {
      limit: Number(req.query.limit) || 20,
      status: req.query.status || 'suggested',
    });
    res.json({ suggestions: suggestions.map((item) => enrichSuggestionSource(item)) });
  } catch (err) {
    console.error('Failed to list suggestions', err);
    res.status(500).json({ error: 'Failed to list AI suggestions' });
  }
}

// Force ingest + retrieval + generation pipeline for the current user
async function refreshSuggestions(req, res) {
  try {
    const result = await refreshSuggestionsForUser(req.user.id, {
      maxMessages: req.body?.maxMessages,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      source: 'manual',
    });
    res.json({
      suggestions: enrichSuggestionsWithSource(result.suggestions, result.contexts),
      ingested: result.ingested,
      contextsUsed: result.contexts?.length || 0,
    });
  } catch (err) {
    const message = err?.message || 'Failed to refresh AI suggestions';
    const status = err instanceof AiProviderError ? 502 : (/token/i.test(message) ? 400 : 500);
    console.error('Failed to refresh suggestions', err);
    res.status(status).json({ error: message });
  }
}

// Mark a suggestion accepted (helper endpoint; does not create a todo)
async function acceptSuggestion(req, res) {
  const suggestionId = Number(req.params.id);
  if (!Number.isFinite(suggestionId)) {
    return res.status(400).json({ error: 'Invalid suggestion id' });
  }
  try {
    const updated = await aiSuggestions.updateStatus(suggestionId, req.user.id, 'accepted');
    if (!updated) return res.status(404).json({ error: 'Suggestion not found' });
    await logEventSafe({
      type: 'ai.suggestions.accepted',
      userId: req.user.id,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      source: 'api',
      metadata: { suggestionId },
    });
    res.json({ suggestion: updated });
  } catch (err) {
    console.error('Failed to accept suggestion', err);
    res.status(500).json({ error: 'Failed to accept suggestion' });
  }
}

// Mark a suggestion dismissed (records optional reason)
async function dismissSuggestion(req, res) {
  const suggestionId = Number(req.params.id);
  if (!Number.isFinite(suggestionId)) {
    return res.status(400).json({ error: 'Invalid suggestion id' });
  }
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  const metadataPatch = {
    dismissedAt: new Date().toISOString(),
    ...(reason ? { dismissedReason: reason } : {}),
  };
  try {
    const updated = await aiSuggestions.updateStatus(suggestionId, req.user.id, 'dismissed', metadataPatch);
    if (!updated) return res.status(404).json({ error: 'Suggestion not found' });
    res.json({ suggestion: updated });
  } catch (err) {
    console.error('Failed to dismiss suggestion', err);
    res.status(500).json({ error: 'Failed to dismiss suggestion' });
  }
}

// Bulk dismiss suggestions for the current user
async function dismissSuggestionsBulk(req, res) {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((id) => Number(id)).filter(Number.isFinite) : [];
  if (ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required' });
  }
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  const metadataPatch = {
    dismissedAt: new Date().toISOString(),
    ...(reason ? { dismissedReason: reason } : {}),
  };
  try {
    const updated = await aiSuggestions.bulkUpdateStatus(req.user.id, ids, 'dismissed', metadataPatch);
    res.json({ dismissed: updated.map((s) => s.id) });
  } catch (err) {
    console.error('Failed to bulk dismiss suggestions', err);
    res.status(500).json({ error: 'Failed to dismiss suggestions' });
  }
}

module.exports = {
  rephrase,
  listSuggestions,
  refreshSuggestions,
  acceptSuggestion,
  dismissSuggestion,
  dismissSuggestionsBulk,
};
