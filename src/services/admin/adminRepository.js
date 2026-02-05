'use strict';

class AdminRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async countUsersTotal({ role } = {}) {
    const { clause, params } = this.buildUserFilters({ role });
    const query = `SELECT COUNT(*)::int AS total FROM users u ${clause}`;
    const { rows } = await this.pool.query(query, params);
    return rows[0]?.total || 0;
  }

  async countActiveUsersSince(activeSince) {
    const { rows } = await this.pool.query(
      'SELECT COUNT(*)::int AS total FROM users WHERE last_active_at >= $1',
      [activeSince]
    );
    return rows[0]?.total || 0;
  }

  async listUsersWithMetrics({ limit, offset, role }) {
    const { clause, params } = this.buildUserFilters({ role });
    const query = `
      SELECT
        u.id,
        u.email,
        u.name,
        u.role,
        u.provider_id,
        u.provider_name,
        u.created_at,
        u.updated_at,
        u.last_active_at,
        u.is_enabled,
        ot.account_email AS outlook_account_email,
        ot.tenant_id AS outlook_tenant_id,
        COALESCE(gen.generated_count, 0) AS suggestions_generated,
        COALESCE(acc.accepted_count, 0) AS suggestions_accepted,
        COALESCE(tok.gen_tokens, 0) AS tokens_generation,
        COALESCE(tok.embed_tokens, 0) AS tokens_embedding
      FROM users u
      LEFT JOIN outlook_tokens ot ON ot.user_id = u.id
      LEFT JOIN (
        SELECT user_id,
               SUM(COALESCE((metadata->>'suggestionsCount')::int, 0)) AS generated_count
        FROM events
        WHERE type = 'ai.suggestions.generated'
        GROUP BY user_id
      ) gen ON gen.user_id = u.id
      LEFT JOIN (
        SELECT user_id,
               COUNT(*) AS accepted_count
        FROM events
        WHERE type = 'ai.suggestions.accepted'
        GROUP BY user_id
      ) acc ON acc.user_id = u.id
      LEFT JOIN (
        SELECT user_id,
               SUM(COALESCE((metadata->>'totalTokens')::int, 0)) FILTER (WHERE type = 'ai.tokens.generation') AS gen_tokens,
               SUM(COALESCE((metadata->>'totalTokens')::int, 0)) FILTER (WHERE type = 'ai.tokens.embedding') AS embed_tokens
        FROM events
        WHERE type IN ('ai.tokens.generation', 'ai.tokens.embedding')
        GROUP BY user_id
      ) tok ON tok.user_id = u.id
      ${clause}
      ORDER BY u.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
    const { rows } = await this.pool.query(query, [...params, limit, offset]);
    return rows;
  }

  async updateUserFlags({ id, role, isEnabled }) {
    const updates = [];
    const params = [];
    if (typeof role === 'string') {
      params.push(role);
      updates.push(`role = $${params.length}`);
    }
    if (typeof isEnabled === 'boolean') {
      params.push(isEnabled);
      updates.push(`is_enabled = $${params.length}`);
    }
    if (!updates.length) return null;
    params.push(id);
    const { rows } = await this.pool.query(
      `
      UPDATE users
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${params.length}
      RETURNING id, email, name, provider_id, provider_name, role, is_enabled, created_at, updated_at, last_active_at;
      `,
      params
    );
    return rows[0] || null;
  }

  async listEvents({ limit, offset, type, userId }) {
    const { clause, params } = this.buildEventFilters({ type, userId });
    const query = `
      SELECT e.*, u.email
      FROM events e
      LEFT JOIN users u ON u.id = e.user_id
      ${clause}
      ORDER BY e.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2};
    `;
    const { rows } = await this.pool.query(query, [...params, limit, offset]);
    return rows;
  }

  async countEvents({ type, userId }) {
    const { clause, params } = this.buildEventFilters({ type, userId });
    const query = `SELECT COUNT(*)::int AS total FROM events e ${clause};`;
    const { rows } = await this.pool.query(query, params);
    return rows[0]?.total || 0;
  }

  async listIntegrations({ limit, offset }) {
    const { rows } = await this.pool.query(
      `
      SELECT
        u.id,
        u.email,
        u.name,
        MAX(CASE WHEN l.provider = 'gmail' THEN l.linked ELSE false END) AS gmail_linked,
        MAX(CASE WHEN l.provider = 'gmail' THEN l.ingest_enabled ELSE false END) AS gmail_ingest_enabled,
        MAX(CASE WHEN l.provider = 'gmail' THEN l.last_linked_at ELSE null END) AS gmail_last_linked_at,
        MAX(CASE WHEN l.provider = 'outlook' THEN l.linked ELSE false END) AS outlook_linked,
        MAX(CASE WHEN l.provider = 'outlook' THEN l.ingest_enabled ELSE false END) AS outlook_ingest_enabled,
        MAX(CASE WHEN l.provider = 'outlook' THEN l.last_linked_at ELSE null END) AS outlook_last_linked_at
      FROM users u
      LEFT JOIN user_provider_links l ON l.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    );
    return rows;
  }

  buildEventFilters({ type, userId }) {
    const clauses = [];
    const params = [];
    if (type) {
      params.push(type);
      clauses.push(`e.type = $${params.length}`);
    }
    if (userId) {
      params.push(userId);
      clauses.push(`e.user_id = $${params.length}`);
    }
    const clause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return { clause, params };
  }

  buildUserFilters({ role }) {
    const clauses = [];
    const params = [];
    if (role) {
      params.push(role);
      clauses.push(`u.role = $${params.length}`);
    }
    const clause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return { clause, params };
  }
}

module.exports = {
  AdminRepository,
};
