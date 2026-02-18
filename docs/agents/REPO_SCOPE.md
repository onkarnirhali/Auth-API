# AGENTS Router (Auth-API)

Current Stage: Alpha (February 18, 2026 to March 18, 2026)

This file routes implementers to the repository governance documents.

## Read Order

1. docs/agents/_core_src/AGENTS_CORE.md
2. docs/agents/_core_src/goals/GOALS_GLOBAL.md
3. docs/agents/REPO_SCOPE.md
4. docs/agents/GOALS_REPO.md
5. docs/agents/GOALS_AGENT.md
6. docs/agents/CHANGE_LOG.md
7. docs/agents/RELEASE_STAGES.md
8. docs/agents/PR_CHECKLIST.md
9. docs/agents/OVERRIDES.md

## Mandatory Goal Gate

1. Every meaningful change must map to one primary goal_id from docs/agents/GOALS_REPO.md.
2. If alignment is partial or 
one, ask user clarification before implementation.
3. Do not mark a change approved without verification evidence.
4. Keep links and references valid.

## Validation Command

Run:


ode tools/agents/validate-governance.mjs
"@ | Set-Content -Path 'AGENTS.md'

  @"
# Repo Scope (Auth-API)

Backend API for authentication, provider linking, todos, AI suggestions, billing integration, and privacy controls.

## In Scope for Governance

- Goal mapping per change
- Stage based planning (Alpha, Beta, Final)
- Verification evidence tracking
- Screenshot request mapping through screens/UX_INDEX.md

## Out of Scope for Governance Bootstrap

- Runtime feature implementation
- Infrastructure provisioning beyond docs and checks
- External legal certification artifacts
