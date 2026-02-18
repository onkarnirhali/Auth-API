'use strict';

const { getProviderMatrix, getAllowedEmailProviders } = require('../providerConnection/providerConnectionService');

function buildEligibilityFromMatrix(matrix, options = {}) {
  const historyReady = Boolean(options.historyReady);
  const mode = matrix?.mode || 'none';
  const allowedEmailProviders = getAllowedEmailProviders(matrix);

  if (mode === 'none') {
    return {
      mode,
      allowedEmailProviders,
      allowTaskHistory: historyReady,
      reasonCode: historyReady ? 'NO_PROVIDER_CONNECTED' : 'INSUFFICIENT_HISTORY',
    };
  }

  return {
    mode,
    allowedEmailProviders,
    allowTaskHistory: true,
  };
}

async function resolveSuggestionEligibility(userId, options = {}) {
  const matrix = await getProviderMatrix(userId);
  const eligibility = buildEligibilityFromMatrix(matrix, options);
  return {
    matrix,
    eligibility,
  };
}

module.exports = {
  buildEligibilityFromMatrix,
  resolveSuggestionEligibility,
};
