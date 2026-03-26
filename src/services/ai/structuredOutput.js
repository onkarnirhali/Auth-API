'use strict';

const { AiProviderError, AI_GENERATION_ERROR_CODES } = require('./errors');
const { validateAgainstSchema } = require('./schemaRegistry');

function truncateRawText(rawText) {
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  if (!text) return null;
  return text.length > 2000 ? `${text.slice(0, 2000)}...` : text;
}

function buildValidationMetadata({ schemaName, rawText, validationErrors }) {
  return {
    schemaName,
    rawText: truncateRawText(rawText),
    validationErrors: validationErrors || [],
  };
}

function validateStructuredEnvelope(result, { schemaName, schema }) {
  const finishReason = result?.finishReason || null;
  const refusal = result?.refusal || null;

  if (refusal) {
    throw new AiProviderError('AI request was refused', {
      code: AI_GENERATION_ERROR_CODES.REFUSAL,
      provider: result?.provider || null,
      metadata: {
        refusal,
        schemaName,
        finishReason,
      },
    });
  }

  if (finishReason === 'length') {
    throw new AiProviderError('AI response hit max token limit', {
      code: AI_GENERATION_ERROR_CODES.MAX_TOKENS,
      provider: result?.provider || null,
      metadata: {
        schemaName,
        finishReason,
        rawText: truncateRawText(result?.rawText),
      },
    });
  }

  if (typeof result?.parsed === 'undefined' || result?.parsed === null) {
    throw new AiProviderError('AI returned an empty structured result', {
      code: AI_GENERATION_ERROR_CODES.EMPTY_RESULT,
      provider: result?.provider || null,
      metadata: {
        schemaName,
        finishReason,
        rawText: truncateRawText(result?.rawText),
      },
    });
  }

  const validation = validateAgainstSchema(schemaName, schema, result.parsed);
  if (!validation.valid) {
    throw new AiProviderError('AI response failed schema validation', {
      code: AI_GENERATION_ERROR_CODES.SCHEMA_VALIDATION_FAILED,
      provider: result?.provider || null,
      metadata: buildValidationMetadata({
        schemaName,
        rawText: result?.rawText,
        validationErrors: validation.errors,
      }),
    });
  }

  return {
    parsed: result.parsed,
    rawText: typeof result?.rawText === 'string' ? result.rawText : '',
    usage: result?.usage || null,
    provider: result?.provider || null,
    model: result?.model || null,
    finishReason,
    refusal,
    validationErrors: null,
  };
}

module.exports = {
  validateStructuredEnvelope,
  truncateRawText,
};
