'use strict';

const { getProvider } = require('./providerFactory');

async function generateText({ systemPrompt, userPrompt, temperature, maxTokens }) {
  const provider = getProvider();
  return provider.generate({ systemPrompt, userPrompt, temperature, maxTokens });
}

module.exports = {
  generateText,
};
