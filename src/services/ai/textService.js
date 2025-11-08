'use strict';

const { generateText } = require('./index');
const { AiProviderError } = require('./errors');

const SYSTEM_PROMPT = [
  'You help users polish short task descriptions.',
  'Rewrite the provided text so it is clear, concise, and action-oriented.',
  'Preserve the original intent, keep it under 30 words, and do not add new tasks.',
].join(' ');

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

  const { text } = await generateText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: options.maxTokens || 120,
    temperature: typeof options.temperature === 'number' ? options.temperature : 0.2,
  });

  if (!text) {
    throw new AiProviderError('AI provider returned an empty response', { code: 'EMPTY_RESPONSE' });
  }
  return text.replace(/\s+/g, ' ').trim();
}

module.exports = {
  rephraseDescription,
};
