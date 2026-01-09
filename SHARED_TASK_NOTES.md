# Helios - Shared Task Notes

## Current State (2026-01-09)

The Helios project is feature-complete with all Phase 1, 2, and 3 tasks implemented.

### Test Status
- All 263 unit/integration tests passing
- 15 E2E tests conditionally skipped (require deployment environment)
- TypeScript SDK: 26 tests passing
- Python SDK: 32 tests passing
- Overall coverage: 73.80%

### What Was Just Done
- Added unit tests for `src/utils/errors.ts` (now 100% coverage)
- Verified all tests pass across main project and both SDKs

### Suggested Next Steps (in priority order)

1. **Deploy & Test E2E**: The E2E tests are conditionally skipped. Deploy to staging and run E2E tests:
   ```bash
   STAGING_URL=<url> STAGING_API_KEY=<key> ANTHROPIC_API_KEY=<key> npm run test:e2e
   ```

2. **Integration Tests for taskIndex.ts**: Add tests for task listing pagination edge cases
   - File: `src/services/taskIndex.ts` (75% coverage)
   - Missing tests: `cleanupExpiredTasks`, `getTasksPage`, offset handling

3. **Improve logs.ts Coverage**: Add tests for streaming log edge cases
   - File: `src/utils/logs.ts` (84.02% coverage)
   - Missing tests: `finalize()` when buffer not empty, error during R2 upload

4. **WebSocket Integration Tests**: Consider adding integration-style tests for WebSocket streaming
   - File: `src/routes/stream.ts` (22.87% coverage)
   - Would need mock WebSocket implementation

### Files to Avoid
- `src/container/runner.ts` - Requires actual Cloudflare Container infrastructure
- `src/routes/stream.ts` (processTask function) - Requires container infrastructure

### Commands
```bash
# Run all tests
npm test

# Run with coverage
npx vitest run --coverage

# Run SDK tests
cd sdk/typescript && npm test
cd sdk/python && python3 -m pytest -v

# Type check
npm run typecheck
```
