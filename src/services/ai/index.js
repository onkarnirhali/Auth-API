'use strict';

const { getProvider } = require('./providerFactory');

async function generateText({ systemPrompt, userPrompt, temperature, maxTokens }) {
  const provider = getProvider();
  return provider.generate({ systemPrompt, userPrompt, temperature, maxTokens });
}

async function generateEmbedding({ text }) {
  const provider = getProvider();
  if (!provider.embed) {
    throw new Error(`Provider ${provider.name || 'unknown'} does not support embeddings`);
  }
  return provider.embed({ text });
}

module.exports = {
  generateText,
  generateEmbedding,
};
