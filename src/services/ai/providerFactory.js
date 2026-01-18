'use strict';

const { getConfig, PROVIDERS } = require('./config');
const { createOpenAiProvider } = require('./providers/openAiProvider');
const { createOllamaProvider } = require('./providers/ollamaProvider');

let cachedProvider = null;
let cachedConfigKey = null;

// Builds/caches provider instances based on env config to avoid re-instantiation
function buildProvider() {
  const config = getConfig();
  const key = JSON.stringify({ provider: config.provider, config });
  if (cachedProvider && cachedConfigKey === key) {
    return cachedProvider;
  }

  let provider;
  if (config.provider === PROVIDERS.OPENAI) {
    provider = createOpenAiProvider(config.openAi);
  } else {
    provider = createOllamaProvider(config.ollama);
  }
  cachedProvider = provider;
  cachedConfigKey = key;
  return provider;
}

function getProvider() {
  return buildProvider();
}

module.exports = {
  getProvider,
};
