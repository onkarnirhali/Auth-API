'use strict';

// Use explicit names and IF NOT EXISTS/IF EXISTS to make this idempotent
module.exports = {
  up: async (queryInterface) => {
    const sql = (s) => queryInterface.sequelize.query(s);
    await sql('CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos (user_id)');
    await sql('CREATE INDEX IF NOT EXISTS idx_todos_user_status ON todos (user_id, status)');
    await sql('CREATE INDEX IF NOT EXISTS idx_todos_user_due_date ON todos (user_id, due_date)');
    await sql('CREATE INDEX IF NOT EXISTS idx_todos_user_created_at ON todos (user_id, created_at)');
  },
  down: async (queryInterface) => {
    const sql = (s) => queryInterface.sequelize.query(s);
    await sql('DROP INDEX IF EXISTS idx_todos_user_id');
    await sql('DROP INDEX IF EXISTS idx_todos_user_status');
    await sql('DROP INDEX IF EXISTS idx_todos_user_due_date');
    await sql('DROP INDEX IF EXISTS idx_todos_user_created_at');
  },
};
