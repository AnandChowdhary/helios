# Helios - Shared Task Notes

## Current State

**All SPEC.md phases complete + additional enhancements.** All Phase 1, Phase 2, and Phase 3 items are checked off.

**Verified on 2026-01-09:** All tests pass (228 main + 25 TS SDK + 31 Python SDK), TypeScript type checking passes, ESLint passes.

**Deployed URLs:**

- **Production**: https://helios.getelysium.workers.dev
- **Staging**: https://helios-staging.getelysium.workers.dev
- **Dashboard**: https://helios.getelysium.workers.dev/dashboard

## Recent Changes (2026-01-09)

Added **real-time log streaming to R2**:

- New `StreamingLogManager` class in `src/utils/logs.ts` handles incremental log uploads
- Logs are flushed to R2 every 5 seconds during task execution (configurable)
- Also flushes when buffer reaches 50 entries (configurable)
- All execution modes updated: SSE sync, WebSocket stream, and async queue
- Metadata now includes `status` field: "streaming" (during execution) or "complete" (after task ends)
- Added `getLogMetadata()` function to check log status without downloading the full file
- Logs are accessible via `GET /v1/tasks/:id/logs` even while task is running
- 15 new tests for StreamingLogManager functionality
- Fallback mechanism: if incremental writes fail, all in-memory logs are written at finalization

## Potential Future Enhancements

All originally planned enhancements are now complete:

1. ~~**Structured error codes**: Replace generic errors with domain-specific codes~~ (Done!)
2. ~~**Webhook retry mechanism**: Add exponential backoff for failed webhooks~~ (Done!)
3. ~~**Rate limit info endpoint**: Let clients query their current rate limit status~~ (Done!)
4. ~~**SDK retry logic**: Automatic exponential backoff for transient failures~~ (Done!)
5. ~~**Task log persistence**: Store logs to R2 for retrieval via API~~ (Done!)
6. ~~**Real-time log streaming to R2**: Stream logs to R2 during execution (incremental)~~ (Done!)

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
