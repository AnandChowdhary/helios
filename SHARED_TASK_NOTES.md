# Helios - Shared Task Notes

## Current State

All Phase 1 and Phase 2 implementation is complete. Phase 3 SDKs are complete (TypeScript and Python).

**Deployed URLs:**

- **Production**: https://helios.getelysium.workers.dev
- **Staging**: https://helios-staging.getelysium.workers.dev

**Test Suite:** 146 tests (111 main project + 15 TS SDK + 20 Python SDK)

## Recent Changes (This Iteration)

- Implemented Python SDK (`sdk/python/`)
  - Sync and async clients: `HeliosClient` and `AsyncHeliosClient`
  - Full API: create_task_async, create_task_stream, get_task, cancel_task, get_task_logs, get_task_diff, push_task_changes, wait_for_task
  - Complete type hints with dataclasses
  - 20 unit tests for the SDK
  - README with usage examples
  - Supports Python 3.9+

## What's Done

Phase 1, 2, and most of Phase 3:

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
- **TypeScript SDK** (sdk/typescript/)
- **Python SDK** (sdk/python/) - NEW

## Remaining Phase 3 Tasks

- WebSocket streaming (currently only SSE)
- Concurrent task limits per account
- Usage tracking and billing
- Dashboard UI (optional)

## Key Files

```
sdk/python/                     # Python SDK (new)
  helios_sdk/client.py          # HeliosClient and AsyncHeliosClient
  helios_sdk/types.py           # Type definitions
  tests/test_client.py          # SDK tests
sdk/typescript/                 # TypeScript SDK
  src/client.ts                 # HeliosClient class
  src/types.ts                  # TypeScript types
src/routes/tasks.ts             # API routes
src/schemas/task.ts             # Validation schemas
```

## Notes

- Both SDKs are published-ready but not yet on npm/PyPI
- Python SDK requires Python 3.9+ and httpx
- TypeScript SDK requires Node.js 18+ for native fetch
- Install Python SDK locally: `pip install ./sdk/python`
- Install TypeScript SDK locally: `npm install ./sdk/typescript`
