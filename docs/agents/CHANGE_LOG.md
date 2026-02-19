# Change Log

| change_id | date | goal_id | alignment | summary | verification | decision |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-02-18-governance-bootstrap | 2026-02-18 | DOC-BOOTSTRAP-001 | direct | Added AGENTS governance docs, playbook submodule, and validation script. | local doc validation script executed | approved |
| 2026-02-18-api-alpha-kickoff-oauth | 2026-02-18 | API-ALPHA-001 | direct | Started Alpha P0 execution for OAuth verification readiness and callback hardening. | Stakeholder-approved kickoff alignment review | approved |
| 2026-02-18-api-alpha-kickoff-providers | 2026-02-18 | API-ALPHA-002 | direct | Started Alpha P0 provider persistence and connection-state reliability work. | Stakeholder-approved kickoff alignment review | approved |
| 2026-02-18-api-alpha-kickoff-suggestions | 2026-02-18 | API-ALPHA-003 | direct | Started Alpha suggestion payload updates for source visibility support. | Stakeholder-approved kickoff alignment review | approved |
| 2026-02-18-api-alpha-oauth-hardening | 2026-02-18 | API-ALPHA-001 | direct | Added Google OAuth config guards, state usage, and Outlook callback validation hardening. | jest --runInBand | approved |
| 2026-02-18-api-alpha-provider-ingest-gate | 2026-02-18 | API-ALPHA-002 | direct | Enforced provider-link ingest gating in suggestion refresh and auto-persisted provider links from token-backed auth. | jest --runInBand | approved |
| 2026-02-18-api-alpha-suggestion-source | 2026-02-18 | API-ALPHA-003 | direct | Added source metadata enrichment for AI suggestions so clients can show Gmail/Outlook origin labels. | jest --runInBand | approved |
| 2026-02-18-api-provider-connection-service | 2026-02-18 | API-ALPHA-002 | direct | Added dedicated provider connection service and switched provider policy handling to user_provider_links authority with disconnect token deletion. | npm test | approved |
| 2026-02-18-api-suggestion-source-control | 2026-02-18 | API-ALPHA-003 | direct | Added provider-aware suggestion eligibility, task-history fallback, merged source control, and context reason codes for none-mode scenarios. | npm test | approved |
| 2026-02-18-api-provider-status-backfill | 2026-02-18 | API-ALPHA-002 | direct | Backfilled provider link policy from existing OAuth tokens for legacy users so connected Gmail/Outlook status renders correctly without overriding explicit disconnects. | npm test | approved |

| 2026-02-18-governance-followup-automation | 2026-02-18 | DOC-BOOTSTRAP-001 | direct | Repaired governance markdown corruption and added branch-protection follow-up runbook plus automation script for required status checks. | node tools/agents/validate-governance.mjs; powershell PSParser syntax check for tools/agents/configure-branch-protection.ps1 | approved |

## Change Entry Contract

- alignment: `direct` or `partial` or `none`
- decision: `approved` or `revise` or `blocked`


