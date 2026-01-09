# Helios - Shared Task Notes

## Current State

All Phase 1 and Phase 2 implementation is complete. 111 tests passing. Both staging and production are deployed.

**Deployed URLs:**

- **Production**: https://helios.getelysium.workers.dev
- **Staging**: https://helios-staging.getelysium.workers.dev

**SPEC.md checklist**: Phase 1 and Phase 2 complete.

## Recent Changes (This Iteration)

- Implemented `POST /v1/tasks/:taskId/push` endpoint (Phase 2 feature)
  - Allows pushing completed task changes to a remote branch
  - Supports automatic PR creation for GitHub repositories
  - Added validation schema for push request
  - Added 9 new integration tests for push functionality
- Updated container HTTP server (`server.mjs`) with `/push` endpoint
- Added `pushContainerChanges` helper function in container runner
- Marked all Phase 2 items as complete in SPEC.md

## What's Done

Phase 1 & 2 are complete:

- Core API (task creation, status, cancel, logs, diff, **push**)
- Authentication and rate limiting
- KV storage for task metadata
- R2 storage for artifacts
- Queue integration for async tasks
- SSE streaming for sync mode
- **Webhook notifications**
- **Push-to-remote with PR creation**
- Container Dockerfile and entrypoint
- Comprehensive test suite (111 tests)
- CI/CD pipelines

## Potential Future Work (Phase 3)

If continuing development, consider these from the SPEC.md roadmap:

- WebSocket streaming (currently only SSE)
- Concurrent task limits per account
- Usage tracking and billing
- Dashboard UI
- SDK clients (npm/pip packages)

## Key Files

```
src/routes/tasks.ts          # API routes including new push endpoint
src/schemas/task.ts          # Validation schemas (CreateTaskSchema, PushTaskSchema)
src/container/runner.ts      # Container management (pushContainerChanges)
container/server.mjs         # Container HTTP server (handlePush)
test/integration/tasks.test.ts  # Integration tests
```

## Notes

- GitHub secrets configured: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, STAGING_API_KEY, ANTHROPIC_API_KEY
- E2E tests require STAGING_URL and STAGING_API_KEY env vars to run
- The push endpoint requires credentials to be passed in the request body (not stored)
