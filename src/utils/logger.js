'use strict';

// Lightweight structured logger; replace with pino/winston if scaling logs
function base(meta = {}) {
  return {
    timestamp: new Date().toISOString(),
    ...meta,
  };
}

function info(message, meta = {}) {
  console.log(JSON.stringify(base({ level: 'info', message, ...meta })));
}

function error(message, meta = {}) {
  console.error(JSON.stringify(base({ level: 'error', message, ...meta })));
}

module.exports = {
  info,
  error,
};
