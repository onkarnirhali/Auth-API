'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('notes', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.BIGINT },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      title: { type: Sequelize.STRING(200), allowNull: false },
      content_json: { type: Sequelize.JSONB, allowNull: false },
      is_password_protected: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      password_hash: { type: Sequelize.TEXT, allowNull: true },
      password_salt: { type: Sequelize.TEXT, allowNull: true },
      password_updated_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { allowNull: false, type: Sequelize.DATE },
      updated_at: { allowNull: false, type: Sequelize.DATE },
    });
    await queryInterface.addIndex('notes', ['user_id']);
    await queryInterface.addIndex('notes', ['user_id', 'updated_at']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('notes');
  },
};

