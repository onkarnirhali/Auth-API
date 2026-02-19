# Repo Scope (Auth-API)

Backend API service for authentication, provider linking, todos, AI suggestions, billing integration, and privacy controls.

## Backend Stack (Current)

- Runtime/framework: Node.js + Express 5 (CommonJS)
- Auth/security: Passport OAuth (Google), JWT cookie auth, Helmet, CORS, rate limiting
- Data/storage: PostgreSQL (`pg`) + Sequelize CLI migrations + `pgvector`
- AI/integrations: OpenAI/Ollama providers, Gmail and Outlook ingestion pipelines, background scheduler
- Testing/tooling: Jest + Supertest, nodemon, governance validation tooling

## In Scope for Governance

- Goal mapping per change
- Stage based planning (Alpha, Beta, Final)
- Verification evidence tracking
- Screenshot request mapping through `../../../screens/UX_INDEX.md`
- API contract, migration, and security consistency checks

## Folder Structure (Current)

```text
/src
  server.js
  /config
  /controllers
  /middleware
  /migrations
  /models
  /routes
  /services
    /admin
    /ai
      /providers
    /gmail
    /outlook
    /providerConnection
    /scheduler
    /suggestions
  /utils
  /validation
/scripts
/tests
/tools/agents
```

## Backend Quality Guardrails

1. Clarity and reuse: keep route, controller, service, and model boundaries explicit; avoid duplicate business logic.
2. Contract consistency: preserve response envelopes, status semantics, and auth cookie behavior unless a goal explicitly approves changes.
3. Migration discipline: prefer additive schema changes, provide safe rollback paths, and avoid destructive migration edits.
4. Operational safety: keep scheduled/background jobs bounded and resilient with fallback behavior.
5. Security and privacy: never expose secrets or token material in logs; enforce least-privilege handling for provider credentials.
6. Observability: preserve request IDs, audit events, and actionable error signals for operational debugging.

## Out of Scope for Governance Bootstrap

- Runtime feature implementation
- Infrastructure provisioning beyond docs and checks
- External legal certification artifacts

## Goal Gate

1. Every meaningful change maps to one primary `goal_id` from `docs/agents/GOALS_REPO.md`.
2. If alignment is partial or none, ask user clarification before implementation.
3. Do not mark a change approved without verification evidence.

## Cross References

- `docs/agents/GOALS_REPO.md`
- `docs/agents/GOALS_AGENT.md`
- `docs/agents/RELEASE_STAGES.md`
- `docs/agents/PR_CHECKLIST.md`
- `docs/agents/_core_src/standards/CODING_STANDARDS.md`
- `docs/agents/_core_src/standards/SECURITY_PRIVACY_STANDARDS.md`
- `README.md`
- `../../../client/src/api`
- `../../../screens/UX_INDEX.md`

## Validation Command

`node tools/agents/validate-governance.mjs`
