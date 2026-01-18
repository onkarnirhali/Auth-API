'use strict';

// Lightweight interval scheduler to refresh AI suggestions for all users

const users = require('../../models/userModel');
const { refreshSuggestionsForUser } = require('../suggestions/suggestionPipeline');

const INTERVAL_MS = Number(process.env.AI_SUGGESTION_REFRESH_INTERVAL_MS || 900_000); // 15m default
const ENABLED = (process.env.AI_SUGGESTION_SCHEDULER_ENABLED || '1').toString() !== '0';

let timer = null;
let running = false;

async function runTick() {
  if (running) return;
  running = true;
  try {
    const ids = await users.listAllIds();
    for (const userId of ids) {
      try {
        await refreshSuggestionsForUser(userId, { maxMessages: Number(process.env.AI_GMAIL_MAX_MESSAGES) || undefined });
      } catch (err) {
        console.error('Scheduler failed refreshing suggestions', { userId, error: err?.message });
      }
    }
  } catch (err) {
    console.error('Scheduler failed to enumerate users', err);
  } finally {
    running = false;
  }
}

function startAiSuggestionScheduler() {
  if (!ENABLED) {
    console.log('AI suggestion scheduler disabled via AI_SUGGESTION_SCHEDULER_ENABLED=0');
    return;
  }
  if (!INTERVAL_MS || INTERVAL_MS <= 0) {
    console.log('AI suggestion scheduler interval not set; skipping start');
    return;
  }
  timer = setInterval(runTick, INTERVAL_MS).unref();
  // Fire once on startup after slight delay
  setTimeout(runTick, 5_000).unref();
  console.log(`AI suggestion scheduler started (every ${INTERVAL_MS}ms)`);
}

function stopAiSuggestionScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  startAiSuggestionScheduler,
  stopAiSuggestionScheduler,
};
