'use strict';

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  },
  down: async (queryInterface) => {
    // Drop extension only if exists; will be recreated by migration if needed again
    await queryInterface.sequelize.query('DROP EXTENSION IF EXISTS vector;');
  },
};
