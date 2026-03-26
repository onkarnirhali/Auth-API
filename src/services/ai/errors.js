'use strict';

class AiProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AiProviderError';
    this.code = options.code || 'AI_PROVIDER_ERROR';
    this.provider = options.provider || null;
    this.status = options.status || null;
    this.metadata = options.metadata || null;
    Error.captureStackTrace?.(this, AiProviderError);
  }
}

const AI_GENERATION_ERROR_CODES = {
  SCHEMA_VALIDATION_FAILED: 'SCHEMA_VALIDATION_FAILED',
  REFUSAL: 'REFUSAL',
  MAX_TOKENS: 'MAX_TOKENS',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  EMPTY_RESULT: 'EMPTY_RESULT',
};

module.exports = {
  AiProviderError,
  AI_GENERATION_ERROR_CODES,
};
