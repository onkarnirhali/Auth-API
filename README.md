# Auth-API

Lightweight Node.js authentication API using Express, Google OAuth (Passport), cookie-based JWT access tokens, and DB-backed refresh tokens (PostgreSQL). Includes Todos CRUD for the authenticated user.

## Features
- Google OAuth login via Passport
- HTTP-only cookies for access/refresh tokens, rotation + revocation in Postgres
- Basic hardening: Helmet, CORS, compression, request IDs, HTTPS redirect (prod)
- Endpoints: `/auth/google`, `/auth/google/callback`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/api/todos/*`
- Health check: `/healthz`

## Requirements
- Node.js 18+
- PostgreSQL 13+

## Environment
Create `.env` in `Auth-API/` with the following baseline configuration (adjust values per environment):

```
PORT=4000
DB_URL=postgres://USER:PASSWORD@localhost:5432/your_db
JWT_SECRET=replace-with-strong-secret
REFRESH_TOKEN_SECRET=replace-with-strong-secret
SESSION_SECRET=replace-with-strong-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback
GOOGLE_CALLBACK_URL_PROD=https://your-domain.example.com/auth/google/callback
GOOGLE_OAUTH_SCOPES="openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send"
CORS_ORIGIN=http://localhost:5173
COOKIE_DOMAIN=localhost
NODE_ENV=development
AI_PROVIDER=ollama
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_TEMPERATURE=0.2
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3
OLLAMA_TEMPERATURE=0.2
OLLAMA_TIMEOUT_MS=15000
```

### Google OAuth & Gmail access
- `GOOGLE_CALLBACK_URL` / `GOOGLE_CALLBACK_URL_PROD` — backend callback for local vs. hosted deployments (Render/Onrender, etc.).
- `GOOGLE_OAUTH_SCOPES` — include `openid email profile` plus the Gmail scopes you plan to use (tokens are only returned for listed scopes). The default string above enables read + send access for later Gmail integrations.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — OAuth credentials from Google Cloud Console. Keep them server-side.

### AI provider configuration
- `AI_PROVIDER` — `ollama` for offline/local development or `openai` for hosted usage. Later providers can be added behind the same flag.
- `OPENAI_API_KEY` — required when `AI_PROVIDER=openai`. Store it in Render/host secrets; never expose it to the Vite client (no `VITE_*` prefix).
- `OPENAI_MODEL`, `OPENAI_TEMPERATURE`, `OPENAI_MAX_OUTPUT_TOKENS` — optional tuning knobs for OpenAI completions (defaults target `gpt-4o-mini` for concise text).
- `OLLAMA_HOST` — URL the API should call when `AI_PROVIDER=ollama` (e.g., `http://host.docker.internal:11434` when running via Docker).
- `OLLAMA_MODEL`, `OLLAMA_TEMPERATURE`, `OLLAMA_TIMEOUT_MS` — configure which local model to call plus simple safety timeouts.

### Local vs. hosted quick reference
| Scenario | Key values | Notes |
| --- | --- | --- |
| Local dev (Node + Ollama) | `AI_PROVIDER=ollama`, `OPENAI_API_KEY=` (empty), `OLLAMA_HOST=http://localhost:11434`, `GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback` | Start an Ollama server locally; tokens stay in `.env` only. |
| Render/other hosted (OpenAI) | `AI_PROVIDER=openai`, set `OPENAI_API_KEY` in platform secrets, `OLLAMA_HOST` optional, `GOOGLE_CALLBACK_URL_PROD=https://<render-app>.onrender.com/auth/google/callback` | Configure `GOOGLE_OAUTH_SCOPES` and OAuth credentials in the provider dashboard; never copy secrets into the client envs. |

### Gmail token persistence & verification
1. Run `npm run db:migrate` to create the `gmail_tokens` table.
2. Ensure `GOOGLE_OAUTH_SCOPES` includes the Gmail scopes you need plus `profile email`.
3. Sign in via `/auth/google`; the Passport callback saves `access_token`, `refresh_token`, scope, token type, and expiry per user.
4. Verify storage with `SELECT * FROM gmail_tokens WHERE user_id = <id>;` — refresh tokens update only when Google sends a new value.
5. Check logs for `Failed to persist Gmail tokens` messages if the upsert fails; login still succeeds but Gmail integrations will be unavailable.

### AI helper endpoints
- `POST /ai/rephrase` (auth required) — body: `{ "description": "pay rent tmw" }`. Returns `{ "rephrased": "Pay the rent tomorrow morning." }`.
- The endpoint uses whichever provider is selected by `AI_PROVIDER` and is meant as a smoke test before the richer grocery suggestion service lands.
- Errors from the provider respond with HTTP 502; missing descriptions return HTTP 400.

## Local Run
```
cd Auth-API
npm install
export DB_URL="postgres://USER:PASSWORD@localhost:5432/your_db"
npm run db:migrate
npm run dev
```
Server runs on `http://localhost:4000`.

## Docker (dev/prod-like)
From repo root:
```
docker compose up --build
```
Services:
- Postgres at `localhost:5432` (user/pass/db: vibecode/vibecode/vibecode_app)
- API at `http://localhost:4000`

## Deploy (Dev Cloud)
Goal: get a stable dev URL you can use daily while iterating.

Required env vars (typical)
- `NODE_ENV=production`
- `DISABLE_HTTPS_REDIRECT=1` (dev cloud without TLS terminator)
- `PORT=4000` (or platform port)
- `DB_URL=postgres://user:pass@host:5432/db`
- `JWT_SECRET=...`
- `GOOGLE_CLIENT_ID=...`
- `GOOGLE_CLIENT_SECRET=...`
- `GOOGLE_CALLBACK_URL=https://your-dev-domain/auth/google/callback` (or http if TLS off)
- `CORS_ORIGIN=https://your-frontend.dev,http://localhost:5173`
- `COOKIE_DOMAIN=your-dev-domain` (optional)

Steps (generic Docker-based PaaS)
1) Connect repo or push the image built from `Auth-API/Dockerfile`.
2) Configure env vars above.
3) Ensure container listens on `PORT` (the app reads `PORT`).
4) Run DB migrations once:
   - `npx sequelize-cli db:migrate`
5) Verify `GET /healthz`, then OAuth and Todos flows.

Post-deploy checklist
- `GET /healthz` → `{ ok: true }`
- `GET/POST /auth/refresh` and `/auth/logout` behave as expected
- `GET /auth/me` returns user after login
- Todos CRUD functions under `/api/todos`
- If using HTTPS: unset `DISABLE_HTTPS_REDIRECT` and verify redirect works

## Migrations
Sequelize CLI is used for migrations; runtime queries use `pg`.

- Run pending migrations: `npm run db:migrate`
- Undo last: `npm run db:migrate:undo`
- Undo all: `npm run db:migrate:undo:all`

Note: Migrations are ordered by timestamp and all pending run when you migrate. Don’t edit already-applied migrations; add a new one instead.

## Routes
- `GET /auth/google` → redirect to Google OAuth
- `GET /auth/google/callback` → sets cookies, returns `{ success: true }`
- `GET/POST /auth/refresh` → rotates refresh token, issues new access token
- `GET/POST /auth/logout` → revokes current refresh token, clears cookies
- `GET /auth/me` → current user
- `GET /api/todos` → list (supports `status`, `q`, `dueFrom`, `dueTo`)
- `POST /api/todos` → create (see `events/api-todos-post.json`)
- `PATCH /api/todos/:id` → update (see `events/api-todos-patch.json`)
- `DELETE /api/todos/:id` → delete
- `GET /healthz` → health check (DB ping)

## Validation & Rate Limiting
- Todos inputs validated with lightweight middleware (422 on invalid).
- Auth refresh/logout are rate limited (defaults: 10 req/min per IP). Tune with env:
  - `RL_REFRESH_WINDOW_MS`, `RL_REFRESH_MAX`
  - `RL_LOGOUT_WINDOW_MS`, `RL_LOGOUT_MAX`

## Postman Helpers
Sample bodies live in `Auth-API/events/` for quick copy-paste:
- `api-todos-post.json`, `api-todos-patch.json`, `api-todos-list-queries.json`

## HTTPS & Deployment Notes
- In production, run behind an HTTPS-terminating proxy and set `NODE_ENV=production`.
- The app trusts proxy headers and redirects HTTP→HTTPS when not secure.
- Set `CORS_ORIGIN` to your exact frontend origin(s), comma-separated.
- Use `COOKIE_DOMAIN` for your domain in prod and secure cookies.
