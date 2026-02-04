'use strict';

// Generates structured task suggestions from email contexts via LLM with strict JSON contract

const { generateText } = require('./index');
const { AiProviderError } = require('./errors');

const MAX_SUGGESTIONS = Number(process.env.AI_SUGGESTION_MAX_RESULTS || 8) || 8;
const MAX_DETAIL_CHARS = Number(process.env.AI_SUGGESTION_MAX_DETAIL_CHARS || 320) || 320;

const SYSTEM_PROMPT = [
  'You are an assistant that creates actionable, concise tasks based ONLY on the provided Gmail messages.',
  'Return a STRICT JSON object with the shape: {"suggestions":[{"title":string,"detail":string,"sourceMessageIds":[string],"confidence":number}]}',
  'Rules:',
  '- Do not invent tasks; derive them from messages.',
  '- Keep titles under 120 characters, imperative voice.',
  '- detail is optional, at most a couple sentences, <= 320 chars.',
  '- confidence between 0 and 1; set lower if unsure.',
  '- sourceMessageIds must reference the Gmail message IDs provided.',
  '- If no clear tasks, return {"suggestions": []}.',
  'Respond with JSON ONLY (no prose, no markdown).',
].join(' ');

function buildUserPrompt(contexts) {
  if (!Array.isArray(contexts) || contexts.length === 0) {
    return 'No messages provided.';
  }
  const lines = ['Messages (most relevant first):'];
  contexts.forEach((ctx, idx) => {
    const parts = [
      `${idx + 1}. id: ${ctx.gmailMessageId}`,
      ctx.subject ? `subject: ${ctx.subject}` : null,
      ctx.snippet ? `snippet: ${ctx.snippet}` : null,
      ctx.plainText ? `body: ${ctx.plainText}` : null,
      ctx.sentAt ? `sent_at: ${ctx.sentAt}` : null,
    ].filter(Boolean);
    lines.push(parts.join('\n'));
    lines.push('');
  });
  lines.push('Return JSON per schema. Do not exceed ' + MAX_SUGGESTIONS + ' tasks.');
  return lines.join('\n');
}

function normalizeSuggestions(json) {
  const parsed = json?.suggestions;
  if (!Array.isArray(parsed)) return [];
  const normalized = [];
  for (const raw of parsed.slice(0, MAX_SUGGESTIONS)) {
    const title = (raw?.title || '').toString().trim();
    if (!title) continue;
    const detailRaw = (raw?.detail || '').toString().trim();
    const detail = detailRaw.slice(0, MAX_DETAIL_CHARS);
    const sourceIds = Array.isArray(raw?.sourceMessageIds)
      ? raw.sourceMessageIds.map((s) => s.toString()).filter(Boolean)
      : [];
    const confidence = Number(raw?.confidence);
    normalized.push({
      title,
      detail: detail || null,
      sourceMessageIds: sourceIds,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
      status: 'suggested',
      metadata: raw?.metadata || {},
    });
  }
  return normalized;
}

function parseJsonResponse(text) {
  if (!text) throw new AiProviderError('Empty AI response when generating suggestions');
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  }
  try {
    const json = JSON.parse(cleaned);
    return normalizeSuggestions(json);
  } catch (err) {
    throw new AiProviderError('AI response was not valid JSON', { code: 'INVALID_JSON', metadata: { raw: cleaned } });
  }
}

async function generateSuggestionsFromContextsWithUsage(contexts) {
  if (!Array.isArray(contexts) || contexts.length === 0) {
    return { suggestions: [], usage: null, provider: null, model: null };
  }

  const userPrompt = buildUserPrompt(contexts);
  const { text, usage, provider, model } = await generateText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: Number(process.env.AI_SUGGESTION_TEMPERATURE || 0.2),
    maxTokens: Number(process.env.AI_SUGGESTION_MAX_TOKENS || 500),
  });
  const suggestions = parseJsonResponse(text);
  return { suggestions, usage, provider, model };
}

async function generateSuggestionsFromContexts(contexts) {
  const result = await generateSuggestionsFromContextsWithUsage(contexts);
  return result.suggestions || [];
}

module.exports = {
  generateSuggestionsFromContexts,
  generateSuggestionsFromContextsWithUsage,
};
