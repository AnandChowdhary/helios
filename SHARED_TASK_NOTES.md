# Helios - Shared Task Notes

## Current State

**PROJECT COMPLETE.** All SPEC.md phases complete + all additional enhancements implemented.

**Verified on 2026-01-09:** All tests pass (229 main + 25 TS SDK + 31 Python SDK), TypeScript type checking passes, ESLint passes.

**Deployed URLs:**

- **Production**: https://helios.getelysium.workers.dev
- **Staging**: https://helios-staging.getelysium.workers.dev
- **Dashboard**: https://helios.getelysium.workers.dev/dashboard

## Recent Changes (2026-01-09)

**Added missing `estimatedDuration` and `streamUrl` fields to async task response:**

- The async task creation response (202 Accepted) now includes all fields specified in SPEC.md
- `estimatedDuration`: Uses the task timeout value (default 300 seconds)
- `streamUrl`: WebSocket URL for streaming task updates (`wss://host/v1/tasks/stream`)
- Added 1 new test to verify custom timeout is used for `estimatedDuration`

Previous: Added real-time log streaming to R2 (StreamingLogManager class)

## Notes

- Task index stored in KV with key `index:{apiKeyId}`, max 1000 task IDs per key
- Index automatically cleans up expired/deleted task IDs on read
- Usage data expires after 90 days in KV
- Dashboard uses vanilla HTML/CSS/JS (no build step)
- Error codes are exported from `src/utils/errors.ts` for SDK use
- Webhook retry config is defined in `src/queue/consumer.ts` (WebhookRetryConfig interface)
- Rate limit info endpoint: `src/routes/rateLimit.ts`
- SDK retry logic: TypeScript in `sdk/typescript/src/client.ts`, Python in `sdk/python/helios_sdk/client.py`
- Streaming log manager: `src/utils/logs.ts` (`StreamingLogManager` class)
- Log storage uses streaming in: SSE (`src/routes/tasks.ts`), WS (`src/routes/stream.ts`), async (`src/queue/consumer.ts`)
- Container raw logs endpoint: `container/server.mjs` at `/logs/raw`
