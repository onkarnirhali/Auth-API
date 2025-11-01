'use strict';

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.addIndex('todos', ['user_id']);
    await queryInterface.addIndex('todos', ['user_id', 'status']);
    await queryInterface.addIndex('todos', ['user_id', 'due_date']);
    await queryInterface.addIndex('todos', ['user_id', 'created_at']);
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex('todos', ['user_id']);
    await queryInterface.removeIndex('todos', ['user_id', 'status']);
    await queryInterface.removeIndex('todos', ['user_id', 'due_date']);
    await queryInterface.removeIndex('todos', ['user_id', 'created_at']);
  },
};
