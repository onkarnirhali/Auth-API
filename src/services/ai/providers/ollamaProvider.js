'use strict';

// Ollama provider wrapper for text generation + embeddings via local API

const axios = require('axios');
const { AiProviderError } = require('../errors');
const { ensurePrompt, normalizeResponse } = require('../utils');

function createOllamaProvider(config) {
  const client = axios.create({
    baseURL: config.host.replace(/\/+$/, ''),
    timeout: config.timeoutMs,
  });

  function normalizeUsage(data) {
    const promptTokens = typeof data?.prompt_eval_count === 'number' ? data.prompt_eval_count : null;
    const completionTokens = typeof data?.eval_count === 'number' ? data.eval_count : null;
    const totalTokens = (typeof promptTokens === 'number' && typeof completionTokens === 'number')
      ? promptTokens + completionTokens
      : (typeof data?.total_tokens === 'number' ? data.total_tokens : null);
    return { promptTokens, completionTokens, totalTokens };
  }

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
        const normalized = normalizeResponse({
          text,
          usage: normalizeUsage(data),
          raw: data,
        });
        return { ...normalized, provider: 'ollama', model: config.model };
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
        return {
          embedding,
          usage: normalizeUsage(data),
          provider: 'ollama',
          model: config.embedModel || config.model,
        };
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
