# Goals Agent Rules (Auth-API)

## Purpose

Ensure every repository change stays aligned to approved goals, release stage, and backend reliability/security standards.

## Goal Gate Rules

1. Assign exactly one primary `goal_id` per meaningful change.
2. Allowed alignment values:
- `direct`
- `partial`
- `none`
3. If alignment is `partial` or `none`, ask the user and record the question before approval.
4. If no valid `goal_id` exists, mark decision as `blocked`.
5. Verification evidence is mandatory before `approved`.

## Backend Delivery Rules

1. Keep route, controller, service, and model responsibilities separated and reusable.
2. Preserve backward-compatible API behavior unless a goal explicitly allows contract changes.
3. Keep auth/session flows stable (token issuance, cookie behavior, role checks, provider-link semantics).
4. Prefer additive migrations and avoid editing already-applied migration history.
5. Keep provider ingestion and AI suggestion paths bounded, observable, and fallback-safe.
6. Preserve event/audit logging coverage for auth, provider, AI, and admin operations.

## API and Security Quality Rules

1. Validate request inputs and keep error responses explicit and consistent.
2. Ensure sensitive endpoints are protected with auth/role checks and appropriate rate limits.
3. Never log raw secrets, token values, or sensitive provider payloads.
4. Keep environment-variable changes documented and aligned with runtime defaults.
5. For schema or contract changes, document rollout impact and client compatibility expectations.

## Verification Evidence

At least one is required:

- Tests passed
- Build passed
- Manual validation steps with outcome
- Contract or schema validation notes
- Migration verification notes (when schema changes are included)
- Endpoint verification notes for auth, role, and error-path behavior where relevant

## Change Entry Contract

Every change entry must include:

- `change_id`
- `date`
- `goal_id`
- `alignment`
- `summary`
- `verification`
- `decision`
