'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('ai_suggestions', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.BIGINT },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      title: { type: Sequelize.TEXT, allowNull: false },
      detail: { type: Sequelize.TEXT, allowNull: true },
      source_message_ids: { type: Sequelize.ARRAY(Sequelize.TEXT), allowNull: true },
      confidence: { type: Sequelize.FLOAT, allowNull: true },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'suggested' },
      metadata: { type: Sequelize.JSONB, allowNull: true },
      created_at: { allowNull: false, type: Sequelize.DATE },
      updated_at: { allowNull: false, type: Sequelize.DATE },
    });
    await queryInterface.addIndex('ai_suggestions', ['user_id']);
    await queryInterface.addIndex('ai_suggestions', ['user_id', 'status']);
    await queryInterface.addIndex('ai_suggestions', ['created_at']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('ai_suggestions');
  },
};
