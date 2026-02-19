# PR Checklist

- [ ] Primary goal_id exists in `docs/agents/GOALS_REPO.md`.
- [ ] `docs/agents/CHANGE_LOG.md` updated for meaningful changes.
- [ ] Alignment is recorded (`direct`, `partial`, or `none`).
- [ ] If alignment is `partial` or `none`, user question and resolution are documented.
- [ ] Verification evidence is documented.
- [ ] Markdown links validate with `node tools/agents/validate-governance.mjs`.
- [ ] Scope remains within current release stage unless explicitly approved.
- [ ] API contract changes are documented in `README.md` and reflected in route/controller behavior.
- [ ] Auth, role, and rate-limit impact has been validated for affected endpoints.
- [ ] New or changed environment variables are documented with sane defaults.
- [ ] Database changes are additive where possible and migration behavior is verified.
- [ ] Sensitive data handling was reviewed (no raw secrets/tokens in logs, events, or errors).
- [ ] AI/provider flow changes include fallback behavior and bounded execution notes where relevant.
- [ ] Client-facing API changes were cross-checked against `../../../client/src/api`.
