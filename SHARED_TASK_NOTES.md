# Helios - Shared Task Notes

## Current State

**All SPEC.md phases complete + additional enhancements.** All Phase 1, Phase 2, and Phase 3 items are checked off.

**Verified on 2026-01-09:** All 211 tests pass, TypeScript type checking passes, ESLint passes.

**Deployed URLs:**

- **Production**: https://helios.getelysium.workers.dev
- **Staging**: https://helios-staging.getelysium.workers.dev
- **Dashboard**: https://helios.getelysium.workers.dev/dashboard

**Test Suite:** 211 tests (all passing)

## Recent Changes (2026-01-09)

Added **GET /v1/rate-limit endpoint** for querying rate limit status:

- Returns current rate limit usage (limit, current, remaining, resetAt)
- Returns concurrent task status (limit, active, remaining)
- 11 new tests added in `test/unit/rateLimitInfo.test.ts`
- Implementation in `src/routes/rateLimit.ts`
- SPEC.md updated with endpoint documentation

## Potential Future Enhancements

1. ~~**Structured error codes**: Replace generic errors with domain-specific codes~~ (Done!)
2. ~~**Webhook retry mechanism**: Add exponential backoff for failed webhooks~~ (Done!)
3. ~~**Rate limit info endpoint**: Let clients query their current rate limit status~~ (Done!)
4. **SDK retry logic**: Automatic exponential backoff for transient failures
5. **Real-time log streaming**: Stream logs to R2 during execution, not just after

## Notes

- Task index stored in KV with key `index:{apiKeyId}`, max 1000 task IDs per key
- Index automatically cleans up expired/deleted task IDs on read
- Usage data expires after 90 days in KV
- Dashboard uses vanilla HTML/CSS/JS (no build step)
- Error codes are exported from `src/utils/errors.ts` for SDK use
- Webhook retry config is defined in `src/queue/consumer.ts` (WebhookRetryConfig interface)
- Rate limit info endpoint: `src/routes/rateLimit.ts` (imports from concurrentTaskLimit.ts)
