# Helios - Shared Task Notes

## Current State

**All Phases Complete** (Phase 1, Phase 2, Phase 3) - only the optional Dashboard UI remains.

**Deployed URLs:**

- **Production**: https://helios.getelysium.workers.dev
- **Staging**: https://helios-staging.getelysium.workers.dev

**Test Suite:** 172 tests (all passing)

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
- Usage tracking and billing

## Remaining Task

- Dashboard UI (optional) - The only unchecked item in SPEC.md

## Before Deploying Updates

The USAGE KV namespace needs to be created if not already done:

```bash
# Production
wrangler kv:namespace create USAGE
# Update wrangler.toml with the returned ID

# Staging
wrangler kv:namespace create USAGE --env staging
# Update wrangler.toml env.staging section with the returned ID
```

## Notes

- All SPEC.md checkboxes are now updated to reflect actual completion status
- Usage data expires after 90 days in KV
- Cost calculation uses Claude Sonnet 4.5 pricing ($3/1M input, $15/1M output)
