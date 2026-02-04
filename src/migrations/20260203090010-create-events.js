'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('events', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.BIGINT },
      type: { type: Sequelize.STRING, allowNull: false },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      request_id: { type: Sequelize.STRING, allowNull: true },
      ip_address: { type: Sequelize.STRING, allowNull: true },
      user_agent: { type: Sequelize.TEXT, allowNull: true },
      source: { type: Sequelize.STRING, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: true },
      created_at: { allowNull: false, type: Sequelize.DATE },
    });
    await queryInterface.addIndex('events', ['type']);
    await queryInterface.addIndex('events', ['user_id']);
    await queryInterface.addIndex('events', ['created_at']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('events');
  },
};
