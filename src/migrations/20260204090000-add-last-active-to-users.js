'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'last_active_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addIndex('users', ['last_active_at']);
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex('users', ['last_active_at']);
    await queryInterface.removeColumn('users', 'last_active_at');
  },
};
