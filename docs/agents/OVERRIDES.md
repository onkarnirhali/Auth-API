# Overrides (Auth-API)

- Preserve existing auth token and provider link behavior while introducing governance updates.
- Prefer additive schema changes in Beta and Final phases.
- Keep suggestion source metadata suitable for frontend visibility and keep confidence/internal scoring out of user-facing contracts unless explicitly required.
- Do not introduce breaking auth cookie names, token semantics, or provider-state behavior without explicit approval.
- Do not store raw secrets, OAuth tokens, encryption keys, or sensitive message bodies in logs or events.
