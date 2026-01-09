# Helios - Shared Task Notes

## Current State

All Phase 1 and Phase 2 implementation is complete. Phase 3 is mostly complete.

**Deployed URLs:**

- **Production**: https://helios.getelysium.workers.dev
- **Staging**: https://helios-staging.getelysium.workers.dev

**Test Suite:** 126 tests (all passing)

## Recent Changes (This Iteration)

- Implemented concurrent task limits per account
  - Added `concurrentTaskLimit` field to ApiKey interface (default: 5)
  - Added `apiKeyId` field to Task and TaskQueueMessage
  - Created middleware to check/enforce limits before task creation
  - Counter increments on task creation, decrements on completion (sync and async)
  - Returns 429 with descriptive message when limit exceeded
  - New headers: `X-Concurrent-Tasks`, `X-Concurrent-Tasks-Limit`, `X-Concurrent-Tasks-Remaining`
  - 15 unit tests for the new feature

## What's Done

Phase 1, 2, and most of Phase 3:

- Core API (task creation, status, cancel, logs, diff, push)
- Authentication and rate limiting
- **Concurrent task limits per account** - NEW
- KV storage for task metadata
- R2 storage for artifacts
- Queue integration for async tasks
- SSE streaming for sync mode
- Webhook notifications
- Push-to-remote with PR creation
- Container Dockerfile and entrypoint
- Comprehensive test suite
- CI/CD pipelines
- TypeScript SDK (sdk/typescript/)
- Python SDK (sdk/python/)

## Remaining Phase 3 Tasks

- WebSocket streaming (currently only SSE)
- Usage tracking and billing
- Dashboard UI (optional)

## Key Files

```
src/middleware/concurrentTaskLimit.ts  # Concurrent task limit middleware (new)
src/routes/tasks.ts                    # API routes (updated)
src/queue/consumer.ts                  # Queue consumer (updated)
src/types/index.ts                     # Type definitions (updated)
test/unit/concurrentTaskLimit.test.ts  # Tests for concurrent limits (new)
```

## Notes

- Concurrent task limit uses the same RATE_LIMITS KV namespace with `concurrent:` prefix
- Default concurrent task limit is 5 if not specified in API key
- The counter is stored with 24-hour TTL and auto-cleaned when it reaches 0
- Both SDKs are published-ready but not yet on npm/PyPI
