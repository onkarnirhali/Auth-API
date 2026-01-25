'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('user_provider_links', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.BIGINT },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      provider: { type: Sequelize.STRING, allowNull: false },
      linked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      ingest_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      last_linked_at: { type: Sequelize.DATE, allowNull: true },
      last_sync_at: { type: Sequelize.DATE, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: true },
      created_at: { allowNull: false, type: Sequelize.DATE },
      updated_at: { allowNull: false, type: Sequelize.DATE },
    });
    await queryInterface.addIndex('user_provider_links', ['user_id', 'provider'], {
      unique: true,
      name: 'user_provider_links_user_provider_unique',
    });
    await queryInterface.addIndex('user_provider_links', ['user_id']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('user_provider_links');
  },
};
