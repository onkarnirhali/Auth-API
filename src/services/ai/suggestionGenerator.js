'use strict';

// Generates structured task suggestions from email contexts via LLM.

const { generateStructured } = require('./index');
const { AiProviderError, AI_GENERATION_ERROR_CODES } = require('./errors');
const {
  AI_SUGGESTION_RESPONSE_SCHEMA,
  AI_SUGGESTION_SCHEMA_NAME,
  AI_SUGGESTION_SCHEMA_VERSION,
  MAX_SUGGESTIONS,
  MAX_DETAIL_CHARS,
} = require('./schemas/suggestionSchema');

const SYSTEM_PROMPT = [
  'You create actionable task suggestions based only on the provided email messages.',
  'Do not invent tasks or people that are not supported by the messages.',
  'Prefer concise, imperative titles.',
  'Always include detail; use an empty string when no extra detail is needed.',
  'If there are no clear tasks, return no suggestions.',
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
  lines.push(`Return at most ${MAX_SUGGESTIONS} suggestions.`);
  return lines.join('\n');
}

function buildSemanticValidationError(index, field, keyword, message, params = {}) {
  return new AiProviderError('AI response failed schema validation', {
    code: AI_GENERATION_ERROR_CODES.SCHEMA_VALIDATION_FAILED,
    metadata: {
      schemaName: AI_SUGGESTION_SCHEMA_NAME,
      schemaVersion: AI_SUGGESTION_SCHEMA_VERSION,
      validationErrors: [
        {
          instancePath: `/suggestions/${index}/${field}`,
          schemaPath: `semantic/${field}`,
          keyword,
          message,
          params,
        },
      ],
    },
  });
}

function ensureAllowedSourceIds(sourceMessageIds, allowedIds, index) {
  const unknownIds = sourceMessageIds.filter((messageId) => !allowedIds.has(messageId));
  if (unknownIds.length > 0) {
    throw buildSemanticValidationError(
      index,
      'sourceMessageIds',
      'allowedValues',
      'sourceMessageIds must reference provided message IDs',
      { unknownIds }
    );
  }
}

function ensureUniqueSourceIds(sourceMessageIds, index) {
  const seen = new Set();
  const duplicateIds = [];
  for (const messageId of sourceMessageIds) {
    if (seen.has(messageId)) {
      duplicateIds.push(messageId);
      continue;
    }
    seen.add(messageId);
  }
  if (duplicateIds.length > 0) {
    throw buildSemanticValidationError(
      index,
      'sourceMessageIds',
      'uniqueItems',
      'sourceMessageIds must be unique',
      { duplicateIds }
    );
  }
}

function ensureTrimmedSourceIds(sourceMessageIds, index) {
  const blankIds = sourceMessageIds.filter((messageId) => !messageId);
  if (blankIds.length > 0) {
    throw buildSemanticValidationError(
      index,
      'sourceMessageIds',
      'trimmedNonEmpty',
      'sourceMessageIds must not contain blank values after trimming'
    );
  }
}

function normalizeSuggestions(parsed, contexts) {
  const suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
  const allowedIds = new Set(
    (Array.isArray(contexts) ? contexts : [])
      .map((ctx) => String(ctx?.gmailMessageId || '').trim())
      .filter(Boolean)
  );

  return suggestions.slice(0, MAX_SUGGESTIONS).map((raw, index) => {
    const title = String(raw.title || '').trim();
    if (!title) {
      throw buildSemanticValidationError(index, 'title', 'trimmedNonEmpty', 'title must not be empty after trimming');
    }

    const detailRaw = typeof raw.detail === 'string' ? raw.detail.trim() : '';
    const sourceMessageIds = (raw.sourceMessageIds || []).map((entry) => String(entry).trim());
    ensureTrimmedSourceIds(sourceMessageIds, index);
    ensureUniqueSourceIds(sourceMessageIds, index);
    ensureAllowedSourceIds(sourceMessageIds, allowedIds, index);

    return {
      title,
      detail: detailRaw ? detailRaw.slice(0, MAX_DETAIL_CHARS) : null,
      sourceMessageIds,
      confidence: raw.confidence,
      status: 'suggested',
      metadata: {
        schemaName: AI_SUGGESTION_SCHEMA_NAME,
        schemaVersion: AI_SUGGESTION_SCHEMA_VERSION,
      },
    };
  });
}

async function generateSuggestionsFromContextsWithUsage(contexts) {
  if (!Array.isArray(contexts) || contexts.length === 0) {
    return { suggestions: [], usage: null, provider: null, model: null, finishReason: null, refusal: null };
  }

  const userPrompt = buildUserPrompt(contexts);
  const result = await generateStructured({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    schemaName: AI_SUGGESTION_SCHEMA_NAME,
    schema: AI_SUGGESTION_RESPONSE_SCHEMA,
    temperature: Number(process.env.AI_SUGGESTION_TEMPERATURE || 0.2),
    maxTokens: Number(process.env.AI_SUGGESTION_MAX_TOKENS || 500),
  });

  return {
    suggestions: normalizeSuggestions(result.parsed, contexts),
    usage: result.usage || null,
    provider: result.provider || null,
    model: result.model || null,
    finishReason: result.finishReason || null,
    refusal: result.refusal || null,
  };
}

async function generateSuggestionsFromContexts(contexts) {
  const result = await generateSuggestionsFromContextsWithUsage(contexts);
  return result.suggestions || [];
}

module.exports = {
  generateSuggestionsFromContexts,
  generateSuggestionsFromContextsWithUsage,
};
