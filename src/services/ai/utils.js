'use strict';

const { AiProviderError } = require('./errors');

function ensurePrompt(prompt) {
  if (!prompt || !prompt.trim()) {
    throw new AiProviderError('Prompt is required', { code: 'PROMPT_REQUIRED' });
  }
  return prompt.trim();
}

function buildSystemPrompt(base, ctx = '') {
  const trimmedBase = (base || '').trim();
  const trimmedCtx = (ctx || '').trim();
  if (!trimmedCtx) return trimmedBase;
  return `${trimmedBase}\n\nContext:\n${trimmedCtx}`;
}

function normalizeResponse({ text, usage, raw, finishReason = null, refusal = null }) {
  return {
    text: (text || '').trim(),
    usage: usage || null,
    raw: raw || null,
    rawText: (text || '').trim(),
    finishReason,
    refusal,
    validationErrors: null,
  };
}

module.exports = {
  ensurePrompt,
  buildSystemPrompt,
  normalizeResponse,
};
