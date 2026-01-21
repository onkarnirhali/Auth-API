'use strict';

// Wrapper around provider embeddings with dimension normalization for pgvector

const { generateEmbedding } = require('./index');
const { DEFAULT_EMBED_DIM } = require('./config');

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

async function embedText(text, options = {}) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  const { embedding } = await generateEmbedding({ text: trimmed });
  console.log("embedding length:", embedding.length);
  console.log("embedding sample:", embedding);
  return normalizeEmbeddingVector(embedding, options.dimension || DEFAULT_EMBED_DIM);
}

module.exports = {
  embedText,
  normalizeEmbeddingVector,
};
