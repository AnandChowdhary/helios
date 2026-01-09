# Helios - Shared Task Notes

## Current State

**All SPEC.md phases complete + additional enhancements.** All Phase 1, Phase 2, and Phase 3 items are checked off.

**Verified on 2026-01-09:** All tests pass (213 main + 25 TS SDK + 31 Python SDK), TypeScript type checking passes, ESLint passes.

**Deployed URLs:**

- **Production**: https://helios.getelysium.workers.dev
- **Staging**: https://helios-staging.getelysium.workers.dev
- **Dashboard**: https://helios.getelysium.workers.dev/dashboard

## Recent Changes (2026-01-09)

Added **task log persistence to R2**:

- Logs are now stored to R2 at `{taskId}/logs.txt` for all execution paths
- SSE sync mode: logs captured during streaming, stored on completion
- WebSocket stream mode: logs captured during streaming, stored on completion
- Async queue mode: logs fetched from container after task completes
- Container server has new `/logs/raw` endpoint to fetch accumulated logs
- `GET /v1/tasks/:id/logs` endpoint now returns actual logs (previously returned 404)
- Logs include timestamps and event types: `[timestamp] [event] data`
- Metadata includes taskId, createdAt, lineCount
- 2 new tests for log storage verification

## Potential Future Enhancements

1. ~~**Structured error codes**: Replace generic errors with domain-specific codes~~ (Done!)
2. ~~**Webhook retry mechanism**: Add exponential backoff for failed webhooks~~ (Done!)
3. ~~**Rate limit info endpoint**: Let clients query their current rate limit status~~ (Done!)
4. ~~**SDK retry logic**: Automatic exponential backoff for transient failures~~ (Done!)
5. ~~**Task log persistence**: Store logs to R2 for retrieval via API~~ (Done!)
6. **Real-time log streaming to R2**: Stream logs to R2 during execution (incremental), not just after completion

## Notes

- Task index stored in KV with key `index:{apiKeyId}`, max 1000 task IDs per key
- Index automatically cleans up expired/deleted task IDs on read
- Usage data expires after 90 days in KV
- Dashboard uses vanilla HTML/CSS/JS (no build step)
- Error codes are exported from `src/utils/errors.ts` for SDK use
- Webhook retry config is defined in `src/queue/consumer.ts` (WebhookRetryConfig interface)
- Rate limit info endpoint: `src/routes/rateLimit.ts`
- SDK retry logic: TypeScript in `sdk/typescript/src/client.ts`, Python in `sdk/python/helios_sdk/client.py`
- Log storage: SSE/WS in `src/routes/tasks.ts` and `src/routes/stream.ts`, async in `src/queue/consumer.ts`
- Container raw logs endpoint: `container/server.mjs` at `/logs/raw`
