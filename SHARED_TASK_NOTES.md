# Helios - Shared Task Notes

## Current State

**All SPEC.md phases complete + additional enhancements.** All Phase 1, Phase 2, and Phase 3 items are checked off.

**Verified on 2026-01-09:** All 200 tests pass, TypeScript type checking passes, ESLint passes.

**Deployed URLs:**

- **Production**: https://helios.getelysium.workers.dev
- **Staging**: https://helios-staging.getelysium.workers.dev
- **Dashboard**: https://helios.getelysium.workers.dev/dashboard

**Test Suite:** 200 tests (all passing)

## Recent Changes (2026-01-09)

Added **webhook retry mechanism** with exponential backoff:

- Webhooks now retry up to 3 times (4 total attempts) on failure
- Exponential backoff: 1s, 2s, 4s delays between retries
- Retries on: network errors, HTTP 429 (rate limit), HTTP 5xx (server errors)
- Does not retry: HTTP 4xx client errors (except 429)
- Implementation in `src/queue/consumer.ts` (sendWebhook function)
- 10 new tests added in `test/unit/webhookRetry.test.ts`
- SPEC.md updated with retry behavior documentation

## Potential Future Enhancements

1. ~~**Structured error codes**: Replace generic errors with domain-specific codes~~ (Done!)
2. ~~**Webhook retry mechanism**: Add exponential backoff for failed webhooks~~ (Done!)
3. **SDK retry logic**: Automatic exponential backoff for transient failures
4. **Real-time log streaming**: Stream logs to R2 during execution, not just after
5. **Rate limit info endpoint**: Let clients query their current rate limit status

## Notes

- Task index stored in KV with key `index:{apiKeyId}`, max 1000 task IDs per key
- Index automatically cleans up expired/deleted task IDs on read
- Usage data expires after 90 days in KV
- Dashboard uses vanilla HTML/CSS/JS (no build step)
- Error codes are exported from `src/utils/errors.ts` for SDK use
- Webhook retry config is defined in `src/queue/consumer.ts` (WebhookRetryConfig interface)
