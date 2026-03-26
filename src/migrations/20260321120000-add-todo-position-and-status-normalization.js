'use strict';

const TABLE = 'todos';
const POSITION_INDEX = 'idx_todos_user_status_position';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        TABLE,
        'position',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        { transaction }
      );

      await queryInterface.sequelize.query(
        `UPDATE todos SET status = 'in_progress' WHERE status = 'pending'`,
        { transaction }
      );

      await queryInterface.sequelize.query(
        `
        WITH ordered AS (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY user_id, status
              ORDER BY created_at DESC, id DESC
            ) AS new_position
          FROM todos
        )
        UPDATE todos AS t
        SET position = ordered.new_position
        FROM ordered
        WHERE t.id = ordered.id
        `,
        { transaction }
      );

      await queryInterface.changeColumn(
        TABLE,
        'position',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        { transaction }
      );

      await queryInterface.addIndex(TABLE, ['user_id', 'status', 'position'], {
        name: POSITION_INDEX,
        transaction,
      });
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeIndex(TABLE, POSITION_INDEX, { transaction });

      await queryInterface.sequelize.query(
        `UPDATE todos SET status = 'pending' WHERE status = 'in_progress'`,
        { transaction }
      );

      await queryInterface.removeColumn(TABLE, 'position', { transaction });
    });
  },
};
