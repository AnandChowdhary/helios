# Helios - Shared Task Notes

## Current State

**All SPEC.md phases complete + structured error codes added.** All Phase 1, Phase 2, and Phase 3 items are checked off.

**Verified on 2026-01-09:** All 190 tests pass, TypeScript type checking passes, ESLint passes.

**Deployed URLs:**

- **Production**: https://helios.getelysium.workers.dev
- **Staging**: https://helios-staging.getelysium.workers.dev
- **Dashboard**: https://helios.getelysium.workers.dev/dashboard

**Test Suite:** 190 tests (all passing)

## Recent Changes (2026-01-09)

Added **structured error codes** for programmatic error handling:

- All errors now return a `code` field (e.g., `AUTH_MISSING_KEY`, `TASK_NOT_FOUND`)
- Error codes defined in `src/utils/error-codes.ts`
- Helper functions `createError()` and `errorResponse()` in `src/utils/errors.ts`
- All middleware and route handlers updated to use error codes
- SPEC.md updated with error codes documentation table
- Tests updated to verify error codes instead of error messages

## Potential Future Enhancements

From the codebase exploration, here are high-priority improvements:

1. ~~**Structured error codes**: Replace generic errors with domain-specific codes~~ (Done!)
2. **Webhook retry mechanism**: Add exponential backoff for failed webhooks
3. **SDK retry logic**: Automatic exponential backoff for transient failures
4. **Real-time log streaming**: Stream logs to R2 during execution, not just after
5. **Rate limit info endpoint**: Let clients query their current rate limit status

## Notes

- Task index stored in KV with key `index:{apiKeyId}`, max 1000 task IDs per key
- Index automatically cleans up expired/deleted task IDs on read
- Usage data expires after 90 days in KV
- Dashboard uses vanilla HTML/CSS/JS (no build step)
- Error codes are exported from `src/utils/errors.ts` for SDK use
