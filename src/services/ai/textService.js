'use strict';

const { generateText } = require('./index');
const { AiProviderError } = require('./errors');
const { logGenerationUsage } = require('./tokenUsageService');

const SYSTEM_PROMPT = [
  'You help users polish short task descriptions.',
  'Rewrite the provided text so it is clear, concise, and action-oriented.',
  'Preserve the original intent, keep it under 30 words, and do not add new tasks.',
].join(' ');

// Short text rephrase helper with provider-agnostic interface
async function rephraseDescription(description, options = {}) {
  const trimmed = (description || '').trim();
  if (!trimmed) {
    throw new AiProviderError('Description is required to rephrase', { code: 'DESCRIPTION_REQUIRED' });
  }

  const userPrompt = [
    'Original description:',
    '"""',
    trimmed,
    '"""',
    '',
    'Return only the improved description.',
  ].join('\n');

  const { text, usage, provider, model } = await generateText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: options.maxTokens || 120,
    temperature: typeof options.temperature === 'number' ? options.temperature : 0.2,
  });

  if (!text) {
    throw new AiProviderError('AI provider returned an empty response', { code: 'EMPTY_RESPONSE' });
  }
  if (options.userId) {
    await logGenerationUsage({
      userId: options.userId,
      requestId: options.requestId || null,
      ipAddress: options.ipAddress || null,
      userAgent: options.userAgent || null,
      source: options.source || 'rephrase',
      usage,
      provider,
      model,
      purpose: 'rephrase',
    });
  }
  return text.replace(/\s+/g, ' ').trim();
}

module.exports = {
  rephraseDescription,
};
