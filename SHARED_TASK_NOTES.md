# Helios - Shared Task Notes

## Current State

Documentation is now complete. 102 tests passing total:
- Unit tests: 58
- Integration tests: 28
- E2E tests: 16 (15 require staging env vars, 1 runs always)

## Completed Tasks

- E2E tests
- Documentation (README with curl examples, TypeScript examples, error codes, status values)

## Next Priority Tasks

1. **Staging Deployment** - Deploy to Cloudflare and run E2E tests
   - Set up KV namespaces, R2 bucket, Queue
   - Deploy container image to Cloudflare Container Registry
   - Create staging API key and run E2E tests

2. **Production Deployment** - Deploy to production after staging validation

## How to Run E2E Tests

E2E tests require environment variables to run against a deployed staging environment:

```bash
STAGING_URL=https://helios-staging.workers.dev \
STAGING_API_KEY=your-helios-api-key \
ANTHROPIC_API_KEY=your-anthropic-api-key \
npm run test:e2e
```

Without these env vars, E2E tests are skipped (shows helpful message about what to set).

## Key Files

```
README.md                     # Full API documentation with examples
test/e2e/full-flow.test.ts    # E2E tests
container/server.mjs          # HTTP server with /logs SSE endpoint
src/routes/tasks.ts           # POST handler with sync mode SSE streaming
src/container/runner.ts       # Container helpers including getContainerLogStream()
```

## Notes

- Sync mode returns 200 with `Content-Type: text/event-stream`
- Async mode returns 202 with JSON response
- Container log file is at `/tmp/task.log`
- Stream has 10-minute timeout built-in
- Container is stopped after streaming completes (or on error)
