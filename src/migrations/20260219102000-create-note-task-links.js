'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('note_task_links', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.BIGINT },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      note_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'notes', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      task_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'todos', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      created_at: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.addConstraint('note_task_links', {
      fields: ['user_id', 'note_id', 'task_id'],
      type: 'unique',
      name: 'uniq_note_task_links_user_note_task',
    });
    await queryInterface.addIndex('note_task_links', ['user_id']);
    await queryInterface.addIndex('note_task_links', ['task_id']);
    await queryInterface.addIndex('note_task_links', ['note_id']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('note_task_links');
  },
};

