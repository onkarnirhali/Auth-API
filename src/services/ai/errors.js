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

module.exports = {
  AiProviderError,
};
