# Bug Tracker

Central place to track bugs reported during development/testing.

## Entry Format

- `bug_id`: unique id (`BUG-YYYYMMDD-XXX`)
- `date_reported`: ISO date
- `reported_by`: person/source
- `status`: `open` | `in_progress` | `resolved` | `verified`
- `severity`: `low` | `medium` | `high` | `critical`
- `repo_area`: impacted repo/module
- `summary`: one-line description
- `symptoms`: user-visible behavior
- `evidence`: logs, stack traces, request/response snapshots
- `root_cause_research`: technical findings
- `why_now`: why it started showing up now
- `fix_plan`: agreed remediation steps
- `notes`: extra context

---

## BUG-20260218-001

- `bug_id`: BUG-20260218-001
- `date_reported`: 2026-02-18
- `reported_by`: user (manual refresh testing)
- `status`: open
- `severity`: high
- `repo_area`: `Auth-API` (`aiController`, `suggestionPipeline`, `suggestionGenerator`)
- `summary`: Refresh suggestions fails with `AiProviderError: AI response was not valid JSON` and returns `502`.

### Symptoms

- Clicking `Refresh` in AI Suggestions fails.
- Server returns `502` for `POST /ai/suggestions/refresh`.
- No new suggestions shown to user for that attempt.

### Evidence

- Stack trace points to JSON parse failure:
  - `src/services/ai/suggestionGenerator.js:79` (`parseJsonResponse`)
  - `src/services/suggestions/suggestionPipeline.js:205`
  - `src/controllers/aiController.js:117`
- Logged raw provider output is truncated mid-JSON (cuts inside final suggestion detail), so payload is not parseable.
- Request duration is around 12s (`durationMs: 12009`) and ends as `502`.

### Root Cause Research

1. `suggestionGenerator` enforces strict `JSON.parse` on model output (`parseJsonResponse`).
2. Generation is constrained by `AI_SUGGESTION_MAX_TOKENS` (default `500`) while schema asks for up to 8 suggestions with title + detail + source ids.
3. Provider output can be cut mid-object when output budget is exceeded, producing invalid JSON.
4. Controller maps `AiProviderError` to `502`, so parse failure appears as gateway-style error to client.

### Why Now (Behavior Change)

- Provider connection service rollout was not the direct parser break.
- This issue became more visible after moving manual refresh to synchronous bounded behavior (manual refresh now executes generation in-request by default), so invalid JSON is surfaced immediately on user action.
- Earlier async/cache-first paths could hide this failure more often because refresh could return cached suggestions without immediate generation on that click.

### Fix Plan

1. Add robust structured-output handling for suggestion generation (schema-constrained output or JSON mode with strict response format).
2. Add tolerant recovery path for truncated output (safe extraction/fallback instead of hard-failing entire refresh).
3. Reduce response size pressure:
   - lower per-refresh suggestion target or detail length in prompt, or
   - increase generation token budget where safe.
4. If generation parse fails, keep prior suggestions and return graceful partial refresh metadata instead of hard 502.

### Notes

- This bug is different from Cloudflare 502 overload errors. Here the backend itself returns 502 due to provider output parse failure.
