'use strict';

// Retrieve most relevant email contexts for generation using vector search with recency fallback

const emailEmbeddings = require('../../models/emailEmbeddingModel');
const { embedText } = require('../ai/embeddingService');

const DEFAULT_QUERY = process.env.AI_SUGGESTION_QUERY ||
  'Identify actionable tasks, follow-ups, deadlines, and reminders from these Gmail messages.';
const TOP_K = Number(process.env.AI_SUGGESTION_TOP_K || 12) || 12;

async function getRelevantEmailContexts(userId) {
  let contexts = [];
  try {
    const queryEmbedding = await embedText(DEFAULT_QUERY);
    if (queryEmbedding) {
      contexts = await emailEmbeddings.searchSimilar(userId, queryEmbedding, TOP_K);
    }
  } catch (err) {
    console.error('Failed vector search for suggestions, falling back to recency', err?.message || err);
  }

  if (!contexts || contexts.length === 0) {
    contexts = await emailEmbeddings.listRecent(userId, TOP_K);
  }
  return contexts;
}

module.exports = {
  getRelevantEmailContexts,
};
