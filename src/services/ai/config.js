'use strict';

// Normalize AI provider configuration for both OpenAI and Ollama (text + embeddings)

const PROVIDERS = {
  OPENAI: 'openai',
  OLLAMA: 'ollama',
};

const DEFAULT_EMBED_DIM = Number(process.env.EMBEDDING_DIM || 1536) || 1536;

function normalizeProvider(value) {
  const raw = (value || '').toString().trim().toLowerCase();
  if (raw === PROVIDERS.OPENAI) return PROVIDERS.OPENAI;
  if (raw === PROVIDERS.OLLAMA) return PROVIDERS.OLLAMA;
  return PROVIDERS.OLLAMA;
}

function getConfig() {
  const provider = normalizeProvider(process.env.AI_PROVIDER);
  if (provider === PROVIDERS.OPENAI && !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY must be set when AI_PROVIDER=openai');
  }
  if (provider === PROVIDERS.OLLAMA && !process.env.OLLAMA_HOST) {
    throw new Error('OLLAMA_HOST must be set when AI_PROVIDER=ollama');
  }

  return {
    provider,
    openAi: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: Number(process.env.OPENAI_TEMPERATURE || 0.2),
      maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 200),
      embedModel: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
    },
    ollama: {
      host: process.env.OLLAMA_HOST || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'llama3',
      embedModel: process.env.OLLAMA_EMBED_MODEL || process.env.OLLAMA_MODEL || 'nomic-embed-text',
      temperature: Number(process.env.OLLAMA_TEMPERATURE || 0.2),
      timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || 15_000),
    },
    embedding: {
      dimension: DEFAULT_EMBED_DIM,
    },
  };
}

module.exports = {
  PROVIDERS,
  DEFAULT_EMBED_DIM,
  getConfig,
};
