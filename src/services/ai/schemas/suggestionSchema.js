'use strict';

const MAX_SUGGESTIONS = Number(process.env.AI_SUGGESTION_MAX_RESULTS || 8) || 8;
const MAX_DETAIL_CHARS = Number(process.env.AI_SUGGESTION_MAX_DETAIL_CHARS || 320) || 320;

const AI_SUGGESTION_SCHEMA_NAME = 'ai_email_suggestions_v1';
const AI_SUGGESTION_SCHEMA_VERSION = 1;

const AI_SUGGESTION_RESPONSE_SCHEMA = {
  $id: AI_SUGGESTION_SCHEMA_NAME,
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      maxItems: MAX_SUGGESTIONS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'detail', 'sourceMessageIds', 'confidence'],
        properties: {
          title: {
            type: 'string',
            minLength: 1,
            maxLength: 120,
            description: 'Short actionable task title derived only from the provided email context.',
          },
          detail: {
            type: 'string',
            maxLength: MAX_DETAIL_CHARS,
            description: 'Supporting detail for the task suggestion. Use an empty string when no detail is needed.',
          },
          sourceMessageIds: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'string',
              minLength: 1,
            },
            description: 'Message IDs from the provided email context that support the suggestion.',
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Confidence score from 0 to 1.',
          },
        },
      },
    },
  },
};

module.exports = {
  AI_SUGGESTION_SCHEMA_NAME,
  AI_SUGGESTION_SCHEMA_VERSION,
  AI_SUGGESTION_RESPONSE_SCHEMA,
  MAX_SUGGESTIONS,
  MAX_DETAIL_CHARS,
};
