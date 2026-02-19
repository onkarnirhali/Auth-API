# Auth-API Architecture Map

Current backend architecture snapshot for Auth-API.

## Stack

- Node.js + Express 5 (CommonJS)
- PostgreSQL + `pg` + Sequelize CLI migrations
- OAuth: Passport Google and Microsoft OAuth for Outlook
- Auth: JWT access/refresh cookies with rotation and revocation
- AI: OpenAI/Ollama providers, pgvector retrieval, suggestion pipeline
- Testing: Jest + Supertest

## High-Level Layout

```text
Auth-API/
|-- src/
|   |-- server.js
|   |-- config/
|   |   |-- config.js
|   |   |-- db.js
|   |   `-- passport.js
|   |-- controllers/
|   |   |-- adminController.js
|   |   |-- aiController.js
|   |   |-- authController.js
|   |   |-- outlookAuthController.js
|   |   |-- outlookController.js
|   |   |-- providerController.js
|   |   `-- todoController.js
|   |-- middleware/
|   |   |-- authMiddleware.js
|   |   |-- errorHandler.js
|   |   |-- rateLimit.js
|   |   `-- validate.js
|   |-- migrations/
|   |   `-- <timestamp>-*.js
|   |-- models/
|   |   |-- userModel.js
|   |   |-- providerLinkModel.js
|   |   |-- gmailTokenModel.js
|   |   |-- outlookTokenModel.js
|   |   |-- emailEmbeddingModel.js
|   |   |-- aiSuggestionModel.js
|   |   |-- eventModel.js
|   |   |-- gmailSyncCursorModel.js
|   |   `-- outlookSyncCursorModel.js
|   |-- routes/
|   |   |-- authRoutes.js
|   |   |-- todoRoutes.js
|   |   |-- aiRoutes.js
|   |   |-- meRoutes.js
|   |   |-- outlookRoutes.js
|   |   `-- adminRoutes.js
|   |-- services/
|   |   |-- tokenService.js
|   |   |-- eventService.js
|   |   |-- todoService.js
|   |   |-- admin/
|   |   |-- ai/
|   |   |   `-- providers/
|   |   |-- gmail/
|   |   |-- outlook/
|   |   |-- providerConnection/
|   |   |-- scheduler/
|   |   `-- suggestions/
|   |-- utils/
|   |   |-- cookies.js
|   |   |-- encryption.js
|   |   |-- logger.js
|   |   |-- redirects.js
|   |   |-- scopes.js
|   |   `-- ...
|   `-- validation/
|       `-- todoSchemas.js
|-- scripts/
|   `-- promoteAdmin.js
|-- tests/
|   `-- *.test.js
|-- tools/agents/
|   |-- validate-governance.mjs
|   `-- configure-branch-protection.ps1
|-- docs/
|-- events/
|-- package.json
`-- README.md
```

## Route Surface

- `/auth`: OAuth entry/callback, refresh/logout, me
- `/api/todos`: todo CRUD
- `/ai`: rephrase and suggestion lifecycle (list, refresh, accept, dismiss)
- `/me/providers`: provider connection and ingest toggles
- `/outlook`: Outlook read endpoints
- `/admin`: summary, user administration, events, integrations

## Notes

- Keep `README.md` as the canonical runtime/deployment document.
- Keep `docs/agents/*` as the canonical governance workflow documentation.
- Update this file when folder layout or route surface changes significantly.
