'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'provider_name', {
      type: Sequelize.STRING,
      allowNull: true
    }),
    await queryInterface.addColumn('users', 'provider_id', {
      type: Sequelize.STRING,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('users', 'newColumn');
  }
};