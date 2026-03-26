'use strict';

const { getProvider } = require('./providerFactory');
const { AiProviderError, AI_GENERATION_ERROR_CODES } = require('./errors');
const { validateStructuredEnvelope } = require('./structuredOutput');

async function generateText({ systemPrompt, userPrompt, temperature, maxTokens }) {
  const provider = getProvider();
  return provider.generate({ systemPrompt, userPrompt, temperature, maxTokens });
}

async function generateStructured({ systemPrompt, userPrompt, schemaName, schema, temperature, maxTokens }) {
  const provider = getProvider();
  if (!provider.generateStructured) {
    throw new AiProviderError(`Provider ${provider.name || 'unknown'} does not support structured output`, {
      code: AI_GENERATION_ERROR_CODES.PROVIDER_ERROR,
      provider: provider.name || null,
      metadata: { schemaName },
    });
  }

  const result = await provider.generateStructured({
    systemPrompt,
    userPrompt,
    schemaName,
    schema,
    temperature,
    maxTokens,
  });

  return validateStructuredEnvelope(result, { schemaName, schema });
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
  generateStructured,
  generateEmbedding,
};
