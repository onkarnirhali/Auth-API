'use strict';

// Ollama provider wrapper for text generation + embeddings via local API

const axios = require('axios');
const { AiProviderError, AI_GENERATION_ERROR_CODES } = require('../errors');
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

  function parseStructuredContent(rawText) {
    const trimmed = typeof rawText === 'string' ? rawText.trim() : '';
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      throw new AiProviderError('Ollama structured output could not be parsed', {
        provider: 'ollama',
        code: AI_GENERATION_ERROR_CODES.PROVIDER_ERROR,
        metadata: {
          rawText: trimmed.length > 2000 ? `${trimmed.slice(0, 2000)}...` : trimmed,
        },
      });
    }
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
          finishReason: data?.done_reason || null,
          refusal: null,
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
    async generateStructured({ systemPrompt, userPrompt, schema, temperature, maxTokens }) {
      const prompt = ensurePrompt(userPrompt);
      const messages = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt.trim() });
      }
      messages.push({ role: 'user', content: prompt });

      try {
        const { data } = await client.post('/api/chat', {
          model: config.model,
          stream: false,
          format: schema,
          messages,
          options: {
            temperature: typeof temperature === 'number' ? temperature : config.temperature,
            ...(typeof maxTokens === 'number' ? { num_predict: maxTokens } : {}),
          },
        });
        const rawText = data?.message?.content || '';
        const finishReason = data?.done_reason || null;
        return {
          parsed: finishReason === 'length' ? null : parseStructuredContent(rawText),
          rawText,
          usage: normalizeUsage(data),
          raw: data,
          provider: 'ollama',
          model: config.model,
          finishReason,
          refusal: null,
          validationErrors: null,
        };
      } catch (err) {
        if (err instanceof AiProviderError) {
          throw err;
        }
        const status = err?.response?.status || err?.code;
        const message = err?.response?.data?.error || err?.message || 'Ollama structured output request failed';
        throw new AiProviderError(message, {
          provider: 'ollama',
          code: AI_GENERATION_ERROR_CODES.PROVIDER_ERROR,
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
