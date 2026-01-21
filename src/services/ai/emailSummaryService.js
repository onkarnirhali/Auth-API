'use strict';

const { generateText } = require('./index');

const MAX_INPUT_CHARS = Number(process.env.AI_SUMMARY_MAX_INPUT_CHARS || 12000) || 12000;

function enforceWordLimit(text, maxWords) {
  const trimmed = (text || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  const words = trimmed.split(/\s+/);
  if (!Number.isFinite(maxWords) || maxWords <= 0 || words.length <= maxWords) {
    return words.join(' ');
  }
  return words.slice(0, maxWords).join(' ');
}

// Summarize email or thread content into concise plain text for embedding
async function summarizeEmailText(text, { maxWords = 300, contextLabel = 'email' } = {}) {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const input = cleaned.length > MAX_INPUT_CHARS ? cleaned.slice(0, MAX_INPUT_CHARS) : cleaned;

  const systemPrompt = [
    'You are an assistant that summarizes email content for downstream task extraction.',
    `Keep the summary under ${maxWords} words.`,
    'Exclude signatures, disclaimers, trackers, and legal boilerplate. Focus on decisions, asks, deadlines, owners.',
  ].join(' ');

  const userPrompt = [
    `Summarize the following ${contextLabel} in plain text (no bullets needed).`,
    `Hard limit: ${maxWords} words.`,
    'Text:',
    '"""',
    input,
    '"""',
  ].join('\n');

  const { text: summary } = await generateText({
    systemPrompt,
    userPrompt,
    temperature: 0.2,
    maxTokens: Math.min(maxWords * 4, 1400),
  });

  return enforceWordLimit(summary || '', maxWords);
}

module.exports = {
  summarizeEmailText,
  enforceWordLimit,
};
