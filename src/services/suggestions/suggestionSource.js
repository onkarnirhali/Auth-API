'use strict';

function normalizeProvider(value) {
  if (!value) return null;
  const normalized = String(value).toLowerCase();
  if (normalized.includes('outlook')) return 'outlook';
  if (normalized.includes('gmail') || normalized.includes('google')) return 'gmail';
  return null;
}

function inferProviderFromMessageId(messageId) {
  if (!messageId) return null;
  const id = String(messageId).toLowerCase();
  if (id.startsWith('outlook:')) return 'outlook';
  if (id.startsWith('gmail:')) return 'gmail';
  return null;
}

function buildContextProviderMap(contexts = []) {
  const map = new Map();
  for (const ctx of contexts) {
    const messageId = ctx?.gmailMessageId;
    if (!messageId) continue;
    const provider =
      normalizeProvider(ctx?.metadata?.provider) ||
      inferProviderFromMessageId(messageId) ||
      'gmail';
    map.set(String(messageId), provider);
  }
  return map;
}

function resolveProvidersForSuggestion(suggestion, contextProviderMap = null) {
  const providers = new Set();
  const ids = Array.isArray(suggestion?.sourceMessageIds) ? suggestion.sourceMessageIds : [];

  for (const sourceId of ids) {
    const key = String(sourceId);
    const fromContext = contextProviderMap ? contextProviderMap.get(key) : null;
    const inferred = fromContext || inferProviderFromMessageId(key) || 'gmail';
    if (inferred) providers.add(inferred);
  }

  if (providers.size === 0) {
    const fromMetadata = normalizeProvider(suggestion?.metadata?.source);
    if (fromMetadata) providers.add(fromMetadata);
  }

  return providers;
}

function buildSourceFields(providers) {
  const list = Array.from(providers);
  if (list.length === 1 && list[0] === 'gmail') {
    return { source: 'gmail', sourceLabel: 'Gmail Inbox' };
  }
  if (list.length === 1 && list[0] === 'outlook') {
    return { source: 'outlook', sourceLabel: 'Outlook Inbox' };
  }
  if (list.includes('gmail') && list.includes('outlook')) {
    return { source: 'multi', sourceLabel: 'Gmail + Outlook' };
  }
  return { source: 'email', sourceLabel: 'Email Inbox' };
}

function enrichSuggestionSource(suggestion, contextProviderMap = null) {
  const providers = resolveProvidersForSuggestion(suggestion, contextProviderMap);
  const sourceFields = buildSourceFields(providers);
  return {
    ...suggestion,
    metadata: {
      ...(suggestion?.metadata || {}),
      ...sourceFields,
    },
  };
}

function enrichSuggestionsWithSource(suggestions = [], contexts = []) {
  const providerMap = buildContextProviderMap(contexts);
  return (suggestions || []).map((suggestion) => enrichSuggestionSource(suggestion, providerMap));
}

module.exports = {
  enrichSuggestionSource,
  enrichSuggestionsWithSource,
};
