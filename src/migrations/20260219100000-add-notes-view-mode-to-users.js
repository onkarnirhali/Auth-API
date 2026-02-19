'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'notes_view_mode', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'list',
    });
    await queryInterface.addIndex('users', ['notes_view_mode']);
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex('users', ['notes_view_mode']);
    await queryInterface.removeColumn('users', 'notes_view_mode');
  },
};

