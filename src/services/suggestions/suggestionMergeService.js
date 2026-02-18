'use strict';

const MAX_RESULTS = Number(process.env.AI_SUGGESTION_MAX_RESULTS || 8) || 8;

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreSuggestion(suggestion, kind, index) {
  if (kind === 'email') {
    const confidence = typeof suggestion.confidence === 'number' ? suggestion.confidence : 0.55;
    return 1 + confidence - index * 0.001;
  }
  const recurrenceCount = Number(suggestion?.metadata?.recurrenceCount || 0);
  return 0.7 + Math.min(0.25, recurrenceCount * 0.02) - index * 0.001;
}

function mergeSuggestions({ emailSuggestions = [], historySuggestions = [], maxResults = MAX_RESULTS }) {
  const ranked = [];

  for (let i = 0; i < emailSuggestions.length; i += 1) {
    ranked.push({
      suggestion: emailSuggestions[i],
      score: scoreSuggestion(emailSuggestions[i], 'email', i),
    });
  }
  for (let i = 0; i < historySuggestions.length; i += 1) {
    ranked.push({
      suggestion: historySuggestions[i],
      score: scoreSuggestion(historySuggestions[i], 'history', i),
    });
  }

  ranked.sort((a, b) => b.score - a.score);

  const seen = new Set();
  const merged = [];
  for (const item of ranked) {
    const key = normalizeTitle(item.suggestion?.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item.suggestion);
    if (merged.length >= maxResults) break;
  }

  return merged;
}

module.exports = {
  mergeSuggestions,
};
