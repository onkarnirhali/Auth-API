'use strict';

const Ajv = require('ajv');

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});

const compiledSchemas = new Map();

function cloneSchema(schema) {
  return JSON.parse(JSON.stringify(schema));
}

function normalizeErrors(errors = []) {
  const list = Array.isArray(errors) ? errors : [];
  return list.map((entry) => ({
    instancePath: entry.instancePath || '',
    schemaPath: entry.schemaPath || '',
    keyword: entry.keyword || '',
    message: entry.message || '',
    params: entry.params || {},
  }));
}

function registerSchema(schemaName, schema) {
  if (!schemaName) {
    throw new Error('schemaName is required');
  }
  if (!schema || typeof schema !== 'object') {
    throw new Error(`schema is required for ${schemaName}`);
  }
  if (compiledSchemas.has(schemaName)) {
    return compiledSchemas.get(schemaName);
  }

  const frozenSchema = cloneSchema(schema);
  const validate = ajv.compile(frozenSchema);
  const entry = { schema: frozenSchema, validate };
  compiledSchemas.set(schemaName, entry);
  return entry;
}

function getSchema(schemaName) {
  return compiledSchemas.get(schemaName) || null;
}

function validateAgainstSchema(schemaName, schema, payload) {
  const entry = registerSchema(schemaName, schema);
  const valid = entry.validate(payload);
  return {
    valid: Boolean(valid),
    errors: normalizeErrors(entry.validate.errors),
    schema: entry.schema,
  };
}

module.exports = {
  registerSchema,
  getSchema,
  validateAgainstSchema,
  normalizeErrors,
};
