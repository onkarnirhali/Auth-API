'use strict';

const getDim = () => {
  const dim = Number(process.env.EMBEDDING_DIM || 1536);
  if (!Number.isFinite(dim) || dim <= 0) return 1536;
  return Math.floor(dim);
};

module.exports = {
  up: async (queryInterface) => {
    const dim = getDim();
    await queryInterface.sequelize.query(`
      CREATE TABLE email_embeddings (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        gmail_message_id TEXT NOT NULL,
        gmail_thread_id TEXT,
        subject TEXT,
        snippet TEXT,
        plain_text TEXT,
        sent_at TIMESTAMPTZ,
        embedding vector(${dim}),
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX email_embeddings_user_msg_uidx
      ON email_embeddings (user_id, gmail_message_id);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX email_embeddings_user_created_idx
      ON email_embeddings (user_id, created_at DESC);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX email_embeddings_vector_idx
      ON email_embeddings
      USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
    `);
  },
  down: async (queryInterface) => {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS email_embeddings;');
  },
};
