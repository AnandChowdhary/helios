# Helios - Shared Task Notes

## Current State

**All SPEC.md phases complete + task listing added.** All Phase 1, Phase 2, and Phase 3 items are checked off.

**Verified on 2026-01-09:** All 190 tests pass, TypeScript type checking passes, ESLint passes.

**Deployed URLs:**

- **Production**: https://helios.getelysium.workers.dev
- **Staging**: https://helios-staging.getelysium.workers.dev
- **Dashboard**: https://helios.getelysium.workers.dev/dashboard

**Test Suite:** 190 tests (all passing)

## Recent Changes (2026-01-09)

Added **GET /v1/tasks** endpoint for listing tasks with pagination and status filtering:

- Lists tasks for authenticated API key in reverse chronological order
- Supports `limit`, `offset`, and `status` query parameters
- Uses secondary index in KV for efficient lookups
- Both TypeScript and Python SDKs updated with `listTasks()`/`list_tasks()` methods
- 9 new integration tests added
- SPEC.md updated with endpoint documentation

## Potential Future Enhancements

From the codebase exploration, here are high-priority improvements:

1. **Structured error codes**: Replace generic errors with domain-specific codes
2. **Webhook retry mechanism**: Add exponential backoff for failed webhooks
3. **SDK retry logic**: Automatic exponential backoff for transient failures
4. **Real-time log streaming**: Stream logs to R2 during execution, not just after
5. **Rate limit info endpoint**: Let clients query their current rate limit status

## Notes

- Task index stored in KV with key `index:{apiKeyId}`, max 1000 task IDs per key
- Index automatically cleans up expired/deleted task IDs on read
- Usage data expires after 90 days in KV
- Dashboard uses vanilla HTML/CSS/JS (no build step)
