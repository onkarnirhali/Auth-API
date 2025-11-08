'use strict';

const { rephraseDescription } = require('../services/ai/textService');
const { AiProviderError } = require('../services/ai/errors');

async function rephrase(req, res) {
  try {
    const { description } = req.body || {};
    const rephrased = await rephraseDescription(description);
    res.json({ rephrased });
  } catch (err) {
    if (err instanceof AiProviderError) {
      const status = err.code === 'DESCRIPTION_REQUIRED' ? 400 : 502;
      return res.status(status).json({ error: err.message, code: err.code });
    }
    console.error('Unexpected AI rephrase error', err);
    res.status(500).json({ error: 'Failed to rephrase description' });
  }
}

module.exports = {
  rephrase,
};
