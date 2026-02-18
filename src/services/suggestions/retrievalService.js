'use strict';

// Retrieve most relevant email contexts for generation using vector search with recency fallback

const emailEmbeddings = require('../../models/emailEmbeddingModel');
const { embedTextWithUsage } = require('../ai/embeddingService');

const DEFAULT_QUERY = process.env.AI_SUGGESTION_QUERY ||
  'Identify actionable tasks, follow-ups, deadlines, and reminders from these Gmail messages.';
const TOP_K = Number(process.env.AI_SUGGESTION_TOP_K || 12) || 12;

async function getRelevantEmailContexts(userId, options = {}) {
  const allowedProviders = Array.isArray(options.allowedProviders)
    ? options.allowedProviders.map((provider) => String(provider || '').toLowerCase().trim()).filter(Boolean)
    : null;
  if (Array.isArray(allowedProviders) && allowedProviders.length === 0) {
    return [];
  }

  let contexts = [];
  try {
    const embedded = await embedTextWithUsage(DEFAULT_QUERY, {
      userId,
      source: 'retrieval',
      purpose: 'suggestion_retrieval',
    });
    const queryEmbedding = embedded ? embedded.embedding : null;
    if (queryEmbedding) {
      contexts = await emailEmbeddings.searchSimilar(userId, queryEmbedding, TOP_K, { allowedProviders });
    }
  } catch (err) {
    console.error('Failed vector search for suggestions, falling back to recency', err?.message || err);
  }

  if (!contexts || contexts.length === 0) {
    contexts = await emailEmbeddings.listRecent(userId, TOP_K, { allowedProviders });
  }
  return contexts;
}

module.exports = {
  getRelevantEmailContexts,
};
