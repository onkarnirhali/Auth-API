'use strict';

const events = require('../models/eventModel');
const logger = require('../utils/logger');

async function logEvent(payload) {
  return events.insertEvent(payload);
}

async function logEventSafe(payload) {
  try {
    return await logEvent(payload);
  } catch (err) {
    logger.error('Failed to log event', {
      type: payload?.type,
      userId: payload?.userId,
      requestId: payload?.requestId,
      message: err?.message || 'Unknown error',
    });
    return null;
  }
}

module.exports = {
  logEvent,
  logEventSafe,
};
