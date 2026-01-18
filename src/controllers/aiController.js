'use strict';

const { rephraseDescription } = require('../services/ai/textService');
const { AiProviderError } = require('../services/ai/errors');
const aiSuggestions = require('../models/aiSuggestionModel');
const { refreshSuggestionsForUser } = require('../services/suggestions/suggestionPipeline');

// Rephrase a todo description using the configured LLM provider
async function rephrase(req, res) {
  try {
    const { description } = req.body || {};
    const rephrased = await rephraseDescription(description);
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
    const suggestions = await aiSuggestions.listByUser(req.user.id, Number(req.query.limit) || 20);
    res.json({ suggestions });
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
    });
    res.json({
      suggestions: result.suggestions,
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
    res.json({ suggestion: updated });
  } catch (err) {
    console.error('Failed to accept suggestion', err);
    res.status(500).json({ error: 'Failed to accept suggestion' });
  }
}

module.exports = {
  rephrase,
  listSuggestions,
  refreshSuggestions,
  acceptSuggestion,
};
