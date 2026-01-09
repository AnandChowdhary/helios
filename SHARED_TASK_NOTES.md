# Helios - Shared Task Notes

## Current State

All Phase 1 and Phase 2 implementation is complete. Phase 3 TypeScript SDK is complete.

**Deployed URLs:**

- **Production**: https://helios.getelysium.workers.dev
- **Staging**: https://helios-staging.getelysium.workers.dev

**Test Suite:** 126 tests (111 main project + 15 SDK tests)

## Recent Changes (This Iteration)

- Implemented TypeScript SDK (`sdk/typescript/`)
  - Full client with all API methods: createTaskAsync, createTaskStream, getTask, cancelTask, getTaskLogs, getTaskDiff, pushTaskChanges, waitForTask
  - Complete TypeScript types exported
  - 15 unit tests for the SDK
  - README with usage examples

## What's Done

Phase 1, 2, and partial Phase 3:

- Core API (task creation, status, cancel, logs, diff, push)
- Authentication and rate limiting
- KV storage for task metadata
- R2 storage for artifacts
- Queue integration for async tasks
- SSE streaming for sync mode
- Webhook notifications
- Push-to-remote with PR creation
- Container Dockerfile and entrypoint
- Comprehensive test suite
- CI/CD pipelines
- **TypeScript SDK** (new)

## Potential Future Work (Remaining Phase 3)

- WebSocket streaming (currently only SSE)
- Concurrent task limits per account
- Usage tracking and billing
- Dashboard UI
- Python SDK

## Key Files

```
sdk/typescript/                 # TypeScript SDK (new)
  src/client.ts                 # HeliosClient class
  src/types.ts                  # TypeScript types
  src/index.ts                  # Exports
  src/client.test.ts            # SDK tests
src/routes/tasks.ts             # API routes
src/schemas/task.ts             # Validation schemas
src/container/runner.ts         # Container management
container/server.mjs            # Container HTTP server
```

## Notes

- SDK is published-ready but not yet on npm
- To use the SDK locally, install from path: `npm install ./sdk/typescript`
- SDK requires Node.js 18+ for native fetch
