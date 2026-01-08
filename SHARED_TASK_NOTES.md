# Helios - Shared Task Notes

## Current State

The core API foundation and test suite are complete:

- Hono app with health endpoint
- Auth middleware (API key via Bearer token, SHA-256 hash lookup in KV)
- Rate limiting middleware (per-minute window via KV)
- Validation middleware (Zod-based)
- Task routes: POST /v1/tasks, GET /v1/tasks/:id, POST /v1/tasks/:id/cancel, GET /v1/tasks/:id/logs, GET /v1/tasks/:id/diff
- CI pipeline: GitHub Actions with lint/typecheck/test jobs
- Unit tests for all middleware (auth, rateLimit, validate)
- Integration tests for task routes (61 tests total)

Also I purchased Workers Paid Plan which includes Queues and Containers so you are unblocked.

## Next Priority Tasks

1. **Queue Integration** - Enable TASK_QUEUE when Workers Paid plan is available
2. **Container Integration** - Implement Cloudflare Containers when API is available
3. **E2E Tests** - Add end-to-end tests against staging environment

## Notes

- Zod v4 has breaking changes vs v3 - cannot use `.default({})` on objects with required fields that have their own defaults
- R2 and Queues are commented out in wrangler.toml (need to enable in Cloudflare dashboard first)
- Container integration not yet implemented (Cloudflare Containers API needs to be available)
- Test error responses use `body.error.message` format from the errorHandler

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

test/
├── app.test.ts              # Schema validation tests
├── unit/
│   ├── auth.test.ts         # Auth middleware tests
│   ├── rateLimit.test.ts    # Rate limit middleware tests
│   └── validate.test.ts     # Validation middleware tests
└── integration/
    └── tasks.test.ts        # Task API integration tests
```
