'use strict';

// Wrapper around provider embeddings with dimension normalization for pgvector

const { generateEmbedding } = require('./index');
const { DEFAULT_EMBED_DIM } = require('./config');
const { logEmbeddingUsage } = require('./tokenUsageService');

function normalizeEmbeddingVector(vector, dim = DEFAULT_EMBED_DIM) {
  if (!Array.isArray(vector)) return null;
  const numeric = vector
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));

  if (numeric.length === 0) return null;

  const desired = Number.isFinite(dim) && dim > 0 ? Math.floor(dim) : numeric.length;
  if (numeric.length === desired) return numeric;
  if (numeric.length > desired) return numeric.slice(0, desired);
  const padded = [...numeric];
  while (padded.length < desired) padded.push(0);
  return padded;
}

async function embedTextWithUsage(text, options = {}) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  const { embedding, usage, provider, model } = await generateEmbedding({ text: trimmed });
  const normalized = normalizeEmbeddingVector(embedding, options.dimension || DEFAULT_EMBED_DIM);
  if (options.userId) {
    await logEmbeddingUsage({
      userId: options.userId,
      requestId: options.requestId || null,
      ipAddress: options.ipAddress || null,
      userAgent: options.userAgent || null,
      source: options.source || 'embedding',
      usage,
      provider,
      model,
      purpose: options.purpose || 'embedding',
    });
  }
  return { embedding: normalized, usage, provider, model };
}

async function embedText(text, options = {}) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  const result = await embedTextWithUsage(trimmed, options);
  return result ? result.embedding : null;
}

module.exports = {
  embedText,
  normalizeEmbeddingVector,
  embedTextWithUsage,
};
