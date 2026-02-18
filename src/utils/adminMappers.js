'use strict';

function mapAdminUserRow(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    providerId: row.provider_id,
    providerName: row.provider_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActiveAt: row.last_active_at,
    isEnabled: row.is_enabled !== false,
    outlookAccountEmail: row.outlook_account_email || null,
    outlookTenantId: row.outlook_tenant_id || null,
    suggestionsGenerated: row.suggestions_generated || 0,
    suggestionsAccepted: row.suggestions_accepted || 0,
    tokensGeneration: row.tokens_generation || 0,
    tokensEmbedding: row.tokens_embedding || 0,
  };
}

function mapAdminEventRow(row) {
  return {
    id: row.id,
    type: row.type,
    userId: row.user_id,
    email: row.email || null,
    requestId: row.request_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    source: row.source,
    metadata: row.metadata || null,
    createdAt: row.created_at,
  };
}

function mapAdminIntegrationRow(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    gmailLinked: row.gmail_linked || false,
    gmailIngestEnabled: row.gmail_ingest_enabled || false,
    gmailLastLinkedAt: row.gmail_last_linked_at,
    outlookLinked: row.outlook_linked || false,
    outlookIngestEnabled: row.outlook_ingest_enabled || false,
    outlookLastLinkedAt: row.outlook_last_linked_at,
  };
}

module.exports = {
  mapAdminUserRow,
  mapAdminEventRow,
  mapAdminIntegrationRow,
};
