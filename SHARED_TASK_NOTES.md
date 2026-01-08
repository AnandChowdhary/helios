# Helios - Shared Task Notes

## Current State

The core API foundation is complete:
- Hono app with health endpoint
- Auth middleware (API key via Bearer token, SHA-256 hash lookup in KV)
- Rate limiting middleware (per-minute window via KV)
- Validation middleware (Zod-based)
- Task routes: POST /v1/tasks, GET /v1/tasks/:id, POST /v1/tasks/:id/cancel, GET /v1/tasks/:id/logs, GET /v1/tasks/:id/diff
- CI pipeline with GitHub Actions (lint, typecheck, test, build)

## Next Priority Tasks

1. **Unit Tests** - Add more vitest tests for middleware and routes (currently only 15 tests in test/app.test.ts)
2. **Queue Integration** - Enable TASK_QUEUE when Workers Paid plan is available
3. **Container Dockerfile** - Create container/Dockerfile and entrypoint.sh for Claude Code runner

## Notes

- Zod v4 has breaking changes vs v3 - cannot use `.default({})` on objects with required fields that have their own defaults
- R2 and Queues are commented out in wrangler.toml (need to enable in Cloudflare dashboard first)
- Container integration not yet implemented (Cloudflare Containers API needs to be available)
- ESLint 9 uses flat config (eslint.config.js) - not the legacy .eslintrc format

## File Structure

```
src/
├── index.ts           # Main app entry
├── types/index.ts     # TypeScript types
├── schemas/task.ts    # Zod validation schemas
├── middleware/
│   ├── auth.ts        # API key authentication
│   ├── rateLimit.ts   # Per-key rate limiting
│   └── validate.ts    # Request body validation
├── routes/
│   └── tasks.ts       # Task API routes
└── utils/
    └── errors.ts      # Error handling

.github/
└── workflows/
    └── ci.yml         # CI pipeline (lint, typecheck, test, build)
```
