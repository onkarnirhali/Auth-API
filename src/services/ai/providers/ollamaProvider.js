'use strict';

const axios = require('axios');
const { AiProviderError } = require('../errors');
const { ensurePrompt, normalizeResponse } = require('../utils');

function createOllamaProvider(config) {
  const client = axios.create({
    baseURL: config.host.replace(/\/+$/, ''),
    timeout: config.timeoutMs,
  });

  return {
    name: 'ollama',
    async generate({ systemPrompt, userPrompt, temperature }) {
      const prompt = ensurePrompt(userPrompt);
      const mergedPrompt = systemPrompt
        ? `${systemPrompt.trim()}\n\nUser request:\n${prompt}`
        : prompt;
      try {
        const { data } = await client.post('/api/generate', {
          model: config.model,
          prompt: mergedPrompt,
          stream: false,
          options: {
            temperature: typeof temperature === 'number' ? temperature : config.temperature,
          },
        });
        const text = data?.response || '';
        return normalizeResponse({
          text,
          usage: null,
          raw: data,
        });
      } catch (err) {
        const status = err?.response?.status || err?.code;
        const message = err?.response?.data?.error || err?.message || 'Ollama request failed';
        throw new AiProviderError(message, {
          provider: 'ollama',
          code: status || 'OLLAMA_ERROR',
          status: err?.response?.status || null,
          metadata: err?.response?.data || null,
        });
      }
    },
    async embed({ text }) {
      try {
        const { data } = await client.post('/api/embeddings', {
          model: config.embedModel || config.model,
          prompt: ensurePrompt(text),
        });
        const embedding = data?.embedding;
        if (!Array.isArray(embedding)) {
          throw new AiProviderError('Ollama embedding response missing embedding', { provider: 'ollama' });
        }
        return { embedding };
      } catch (err) {
        const status = err?.response?.status || err?.code;
        const message = err?.response?.data?.error || err?.message || 'Ollama embedding failed';
        throw new AiProviderError(message, {
          provider: 'ollama',
          code: status || 'OLLAMA_EMBED_ERROR',
          status: err?.response?.status || null,
          metadata: err?.response?.data || null,
        });
      }
    },
  };
}

module.exports = {
  createOllamaProvider,
};
