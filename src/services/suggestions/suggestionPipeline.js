'use strict';

const aiSuggestions = require('../../models/aiSuggestionModel');
const { ingestNewEmailsForUser } = require('../gmail/ingestionService');
const { getRelevantEmailContexts } = require('./retrievalService');
const { generateSuggestionsFromContexts } = require('../ai/suggestionGenerator');

async function refreshSuggestionsForUser(userId, options = {}) {
  if (!userId) throw new Error('userId is required to refresh suggestions');

  const ingestResult = await ingestNewEmailsForUser(userId, {
    maxMessages: options.maxMessages,
  });

  const contexts = await getRelevantEmailContexts(userId);
  if (!contexts || contexts.length === 0) {
    // Clear old suggestions if nothing to use
    await aiSuggestions.replaceForUser(userId, []);
    return { ingested: ingestResult.ingested, suggestions: [], contexts: [] };
  }

  const generated = await generateSuggestionsFromContexts(contexts);
  const stored = await aiSuggestions.replaceForUser(userId, generated);
  return {
    ingested: ingestResult.ingested,
    suggestions: stored,
    contexts,
  };
}

module.exports = {
  refreshSuggestionsForUser,
};
