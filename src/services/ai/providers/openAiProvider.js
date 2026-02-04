'use strict';

// OpenAI chat + embedding provider wrapper with unified interface/ error mapping

const OpenAI = require('openai');
const { AiProviderError } = require('../errors');
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

  return {
    name: 'openai',
    async generate({ systemPrompt, userPrompt, temperature, maxTokens }) {
      const prompt = ensurePrompt(userPrompt);
      try {
        const response = await client.chat.completions.create({
          model: config.model,
          temperature: typeof temperature === 'number' ? temperature : config.temperature,
          max_tokens: typeof maxTokens === 'number' ? maxTokens : config.maxOutputTokens,
          messages: [
            { role: 'system', content: systemPrompt || 'You are a concise assistant.' },
            { role: 'user', content: prompt },
          ],
        });
        const choice = response.choices?.[0]?.message?.content || '';
        const normalized = normalizeResponse({
          text: choice,
          usage: normalizeUsage(response.usage),
          raw: response,
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
