'use strict';

function parsePagination(query = {}, { defaultLimit = 25, maxLimit = 100 } = {}) {
  const limit = Math.min(Math.max(Number(query.limit) || defaultLimit, 1), maxLimit);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return { limit, offset };
}

module.exports = {
  parsePagination,
};
