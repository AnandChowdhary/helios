# Helios - Shared Task Notes

## Current State

**All SPEC.md phases complete + additional enhancements.** All Phase 1, Phase 2, and Phase 3 items are checked off.

**Verified on 2026-01-09:** All tests pass (211 main + 25 TS SDK + 31 Python SDK), TypeScript type checking passes, ESLint passes.

**Deployed URLs:**

- **Production**: https://helios.getelysium.workers.dev
- **Staging**: https://helios-staging.getelysium.workers.dev
- **Dashboard**: https://helios.getelysium.workers.dev/dashboard

## Recent Changes (2026-01-09)

Added **SDK retry logic** with automatic exponential backoff for transient failures:

- TypeScript SDK: `retry` config option in `HeliosConfig`
- Python SDK: `RetryConfig` dataclass for `HeliosConfig.retry`
- Retries on 5xx server errors and 429 rate limits (configurable)
- Does NOT retry on 4xx client errors (except 429)
- Default: 3 retries, 1s initial delay, 2x backoff, 10s max delay
- 10 new TypeScript tests, 11 new Python tests
- SPEC.md updated with SDK retry documentation

## Potential Future Enhancements

1. ~~**Structured error codes**: Replace generic errors with domain-specific codes~~ (Done!)
2. ~~**Webhook retry mechanism**: Add exponential backoff for failed webhooks~~ (Done!)
3. ~~**Rate limit info endpoint**: Let clients query their current rate limit status~~ (Done!)
4. ~~**SDK retry logic**: Automatic exponential backoff for transient failures~~ (Done!)
5. **Real-time log streaming**: Stream logs to R2 during execution, not just after

## Notes

- Task index stored in KV with key `index:{apiKeyId}`, max 1000 task IDs per key
- Index automatically cleans up expired/deleted task IDs on read
- Usage data expires after 90 days in KV
- Dashboard uses vanilla HTML/CSS/JS (no build step)
- Error codes are exported from `src/utils/errors.ts` for SDK use
- Webhook retry config is defined in `src/queue/consumer.ts` (WebhookRetryConfig interface)
- Rate limit info endpoint: `src/routes/rateLimit.ts`
- SDK retry logic: TypeScript in `sdk/typescript/src/client.ts`, Python in `sdk/python/helios_sdk/client.py`
