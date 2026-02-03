'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('outlook_tokens', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.BIGINT },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        unique: true,
      },
      access_token: { type: Sequelize.TEXT, allowNull: false },
      refresh_token_enc: { type: Sequelize.TEXT, allowNull: false },
      token_type: { type: Sequelize.STRING, allowNull: true },
      scope: { type: Sequelize.TEXT, allowNull: true },
      expires_at: { type: Sequelize.DATE, allowNull: true },
      tenant_id: { type: Sequelize.STRING, allowNull: true },
      account_email: { type: Sequelize.STRING, allowNull: true },
      created_at: { allowNull: false, type: Sequelize.DATE },
      updated_at: { allowNull: false, type: Sequelize.DATE },
    });
    await queryInterface.addIndex('outlook_tokens', ['user_id']);
    await queryInterface.addIndex('outlook_tokens', ['tenant_id']);
    await queryInterface.addIndex('outlook_tokens', ['expires_at']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('outlook_tokens');
  },
};
