'use strict';

// OpenAI chat + embedding provider wrapper with unified interface/ error mapping

const OpenAI = require('openai');
const { AiProviderError, AI_GENERATION_ERROR_CODES } = require('../errors');
const { ensurePrompt, normalizeResponse } = require('../utils');

function createOpenAiProvider(config) {
  const client = new OpenAI({ apiKey: config.apiKey });

  function normalizeUsage(usage) {
    if (!usage) return null;
    const promptTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : null;
    const completionTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : null;
    const totalTokens = typeof usage.total_tokens === 'number' ? usage.total_tokens : null;
    return { promptTokens, completionTokens, totalTokens };
  }

  function extractContent(message) {
    if (!message) return '';
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          if (entry?.type === 'text') return entry.text || '';
          return '';
        })
        .join('')
        .trim();
    }
    return '';
  }

  function parseStructuredContent(rawText, provider) {
    const trimmed = typeof rawText === 'string' ? rawText.trim() : '';
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      throw new AiProviderError('OpenAI structured output could not be parsed', {
        code: AI_GENERATION_ERROR_CODES.PROVIDER_ERROR,
        provider,
        metadata: {
          rawText: trimmed.length > 2000 ? `${trimmed.slice(0, 2000)}...` : trimmed,
        },
      });
    }
  }

  return {
    name: 'openai',
    async generate({ systemPrompt, userPrompt, temperature, maxTokens }) {
      const prompt = ensurePrompt(userPrompt);
      const maxCompletionTokens = typeof maxTokens === 'number' ? maxTokens : config.maxOutputTokens;
      try {
        const response = await client.chat.completions.create({
          model: config.model,
          temperature: typeof temperature === 'number' ? temperature : config.temperature,
          max_completion_tokens: maxCompletionTokens,
          messages: [
            { role: 'system', content: systemPrompt || 'You are a concise assistant.' },
            { role: 'user', content: prompt },
          ],
        });
        const choice = response.choices?.[0] || null;
        const text = extractContent(choice?.message);
        const normalized = normalizeResponse({
          text,
          usage: normalizeUsage(response.usage),
          raw: response,
          finishReason: choice?.finish_reason || null,
          refusal: choice?.message?.refusal || null,
        });
        return { ...normalized, provider: 'openai', model: config.model };
      } catch (err) {
        const message = err?.message || 'OpenAI request failed';
        const code = err?.code || err?.status || 'OPENAI_ERROR';
        throw new AiProviderError(message, {
          provider: 'openai',
          code,
          status: err?.status,
          metadata: err?.response?.data || null,
        });
      }
    },
    async generateStructured({ systemPrompt, userPrompt, schemaName, schema, temperature, maxTokens }) {
      const prompt = ensurePrompt(userPrompt);
      const maxCompletionTokens = typeof maxTokens === 'number' ? maxTokens : config.maxOutputTokens;
      try {
        const response = await client.chat.completions.create({
          model: config.model,
          temperature: typeof temperature === 'number' ? temperature : config.temperature,
          max_completion_tokens: maxCompletionTokens,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: schemaName,
              strict: true,
              schema,
            },
          },
          messages: [
            { role: 'system', content: systemPrompt || 'You are a concise assistant.' },
            { role: 'user', content: prompt },
          ],
        });
        const choice = response.choices?.[0] || null;
        const rawText = extractContent(choice?.message);
        const finishReason = choice?.finish_reason || null;
        const parsed = choice?.message?.refusal || finishReason === 'length'
          ? null
          : parseStructuredContent(rawText, 'openai');
        return {
          parsed,
          rawText,
          usage: normalizeUsage(response.usage),
          raw: response,
          provider: 'openai',
          model: config.model,
          finishReason,
          refusal: choice?.message?.refusal || null,
          validationErrors: null,
        };
      } catch (err) {
        if (err instanceof AiProviderError) {
          throw err;
        }
        const message = err?.message || 'OpenAI structured output request failed';
        throw new AiProviderError(message, {
          provider: 'openai',
          code: AI_GENERATION_ERROR_CODES.PROVIDER_ERROR,
          status: err?.status || null,
          metadata: err?.response?.data || null,
        });
      }
    },
    async embed({ text }) {
      try {
        const response = await client.embeddings.create({
          input: ensurePrompt(text),
          model: config.embedModel || 'text-embedding-3-small',
        });
        const embedding = response.data?.[0]?.embedding;
        if (!Array.isArray(embedding)) {
          throw new AiProviderError('OpenAI embedding response missing embedding', { provider: 'openai' });
        }
        return {
          embedding,
          usage: normalizeUsage(response.usage),
          provider: 'openai',
          model: config.embedModel || 'text-embedding-3-small',
        };
      } catch (err) {
        const message = err?.message || 'OpenAI embedding request failed';
        const code = err?.code || err?.status || 'OPENAI_EMBED_ERROR';
        throw new AiProviderError(message, {
          provider: 'openai',
          code,
          status: err?.status,
          metadata: err?.response?.data || null,
        });
      }
    },
  };
}

module.exports = {
  createOpenAiProvider,
};
