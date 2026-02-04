'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'role', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'user',
    });
    await queryInterface.addIndex('users', ['role']);
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex('users', ['role']);
    await queryInterface.removeColumn('users', 'role');
  },
};
