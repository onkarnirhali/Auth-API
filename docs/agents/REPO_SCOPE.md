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

## Goal Gate

1. Every meaningful change maps to one primary goal_id from docs/agents/GOALS_REPO.md.
2. If alignment is partial or none, ask user clarification before implementation.
3. Do not mark a change approved without verification evidence.

## Validation Command

node tools/agents/validate-governance.mjs
