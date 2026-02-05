'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'is_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
    await queryInterface.addIndex('users', ['is_enabled']);
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex('users', ['is_enabled']);
    await queryInterface.removeColumn('users', 'is_enabled');
  },
};
