'use strict';

// Vectorized email snippets per user for similarity search (pgvector-backed)

const pool = require('../config/db');

const vectorLiteral = (embedding) => {
  if (!Array.isArray(embedding)) return null;
  return `[${embedding.join(',')}]`;
};

function normalizeAllowedProviders(providers) {
  if (!Array.isArray(providers)) return null;
  const list = providers
    .map((provider) => String(provider || '').toLowerCase().trim())
    .filter((provider) => provider === 'gmail' || provider === 'outlook');
  if (list.length === 0) return [];
  return Array.from(new Set(list));
}

function buildProviderClause(allowedProviders) {
  const providers = normalizeAllowedProviders(allowedProviders);
  if (providers === null || providers.length === 2) return '';
  if (providers.length === 0) return ' AND 1=0 ';
  if (providers[0] === 'gmail') {
    return " AND (gmail_message_id IS NOT NULL AND gmail_message_id NOT LIKE 'outlook:%') ";
  }
  return " AND gmail_message_id LIKE 'outlook:%' ";
}

const mapRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  gmailMessageId: row.gmail_message_id,
  gmailThreadId: row.gmail_thread_id,
  subject: row.subject,
  snippet: row.snippet,
  plainText: row.plain_text,
  sentAt: row.sent_at,
  metadata: row.metadata || {},
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  distance: typeof row.distance === 'number' ? row.distance : null,
});

async function upsertMany(userId, items) {
  if (!userId || !Array.isArray(items) || items.length === 0) return [];
  const client = await pool.connect();
  const results = [];
  try {
    await client.query('BEGIN');
    // Upsert each message by (user, gmail_message_id) to keep embeddings fresh/idempotent
    for (const item of items) {
      const now = new Date();
      const params = [
        userId,
        item.gmailMessageId,
        item.gmailThreadId || null,
        item.subject || null,
        item.snippet || null,
        item.plainText || null,
        item.sentAt || null,
        vectorLiteral(item.embedding),
        item.metadata || {},
        now,
        now,
      ];
      const { rows } = await client.query(
        `
        INSERT INTO email_embeddings (
          user_id, gmail_message_id, gmail_thread_id, subject, snippet, plain_text, sent_at, embedding, metadata, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::vector,$9,$10,$11)
        ON CONFLICT (user_id, gmail_message_id) DO UPDATE
        SET subject = EXCLUDED.subject,
            snippet = EXCLUDED.snippet,
            plain_text = EXCLUDED.plain_text,
            sent_at = EXCLUDED.sent_at,
            embedding = EXCLUDED.embedding,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at
        RETURNING *;
        `,
        params
      );
      results.push(mapRow(rows[0]));
    }
    await client.query('COMMIT');
    return results;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function searchSimilar(userId, queryEmbedding, limit = 10, options = {}) {
  if (!userId) throw new Error('userId required for search');
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    throw new Error('queryEmbedding required for search');
  }
  const vector = vectorLiteral(queryEmbedding);
  const providerClause = buildProviderClause(options.allowedProviders);
  const { rows } = await pool.query(
    `
    SELECT id, user_id, gmail_message_id, gmail_thread_id, subject, snippet, plain_text, sent_at, metadata,
           embedding <-> $2::vector AS distance, created_at, updated_at
    FROM email_embeddings
    WHERE user_id = $1 AND embedding IS NOT NULL
    ${providerClause}
    ORDER BY embedding <-> $2::vector
    LIMIT $3;
    `,
    [userId, vector, limit]
  );
  return rows.map(mapRow);
}

async function listRecent(userId, limit = 20, options = {}) {
  const providerClause = buildProviderClause(options.allowedProviders);
  const { rows } = await pool.query(
    `
    SELECT id, user_id, gmail_message_id, gmail_thread_id, subject, snippet, plain_text, sent_at, metadata, created_at, updated_at
    FROM email_embeddings
    WHERE user_id = $1
    ${providerClause}
    ORDER BY created_at DESC
    LIMIT $2;
    `,
    [userId, limit]
  );
  return rows.map(mapRow);
}

module.exports = {
  upsertMany,
  searchSimilar,
  listRecent,
};
