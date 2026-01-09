# Helios - Shared Task Notes

## Current State

All Phase 1, Phase 2, and Phase 3 implementation is complete (except optional Dashboard UI).

**Deployed URLs:**

- **Production**: https://helios.getelysium.workers.dev
- **Staging**: https://helios-staging.getelysium.workers.dev

**Test Suite:** 172 tests (all passing)

## Recent Changes (This Iteration)

- Implemented **Usage Tracking and Billing** (`GET /v1/usage`, `GET /v1/usage/current`)
  - Daily usage metrics per API key stored in USAGE KV namespace
  - Tracks: requests, tasks created/completed/failed/cancelled, token usage, task duration
  - Usage summary with date range queries (max 90 days)
  - Estimated cost calculation based on Claude API pricing ($3/1M input, $15/1M output)
  - 22 new tests for usage tracking
- Added USAGE KV namespace to wrangler.toml (placeholder ID - needs creation)
- Updated all test files to include USAGE KV mock

## What's Done

All core features complete:

- Core API (task creation, status, cancel, logs, diff, push)
- Authentication and rate limiting
- Concurrent task limits per account
- KV storage for task metadata
- R2 storage for artifacts
- Queue integration for async tasks
- SSE streaming for sync mode
- WebSocket streaming
- Webhook notifications
- Push-to-remote with PR creation
- Container Dockerfile and entrypoint
- Comprehensive test suite (172 tests)
- CI/CD pipelines
- TypeScript SDK (sdk/typescript/)
- Python SDK (sdk/python/)
- **Usage tracking and billing** - NEW

## Remaining Tasks

- Dashboard UI (optional)

## Before Deploying

The USAGE KV namespace needs to be created:

```bash
# Production
wrangler kv:namespace create USAGE
# Update wrangler.toml with the returned ID

# Staging
wrangler kv:namespace create USAGE --env staging
# Update wrangler.toml env.staging section with the returned ID
```

## Key New Files

```
src/services/usage.ts        # Usage tracking service
src/routes/usage.ts          # Usage API endpoints
test/unit/usage.test.ts      # Usage tests
```

## Usage API

```bash
# Get current month usage
curl -H "Authorization: Bearer $API_KEY" \
  https://helios.workers.dev/v1/usage/current

# Get usage for date range (max 90 days)
curl -H "Authorization: Bearer $API_KEY" \
  "https://helios.workers.dev/v1/usage?start=2024-01-01&end=2024-01-31"
```

Response format:
```json
{
  "apiKeyId": "key_xxx",
  "period": { "start": "2024-01-01", "end": "2024-01-31" },
  "totals": {
    "requests": 100,
    "tasksCreated": 50,
    "tasksCompleted": 45,
    "tasksFailed": 5,
    "tasksCancelled": 0,
    "inputTokens": 500000,
    "outputTokens": 100000,
    "totalDurationMs": 300000,
    "estimatedCost": 3.00
  },
  "daily": [...]
}
```

## Notes

- Usage data expires after 90 days in KV
- Cost calculation uses Claude Sonnet 4.5 pricing
- Usage is tracked at task creation (requests, tasksCreated) and completion (tokens, duration, status)
