# Shared Task Notes

## Current Status
All SPEC.md tasks are complete. Project is feature-complete with:
- Core API (tasks, logs, diff, push, cancel)
- Async queue processing with webhooks
- WebSocket streaming
- Rate limiting and concurrent task limits
- TypeScript and Python SDKs

## What Was Just Done (2026-01-09)
Added `getRateLimit()` / `get_rate_limit()` method to both SDKs to expose the rate limit endpoint that was already implemented in the API but not accessible from the SDKs.

## Potential Future Work
Since all core features are complete, here are potential improvements:

1. **Improve stream.ts test coverage** - Currently at ~23% coverage. WebSocket testing is tricky but could be improved.

2. **SDK WebSocket support** - Neither SDK has WebSocket streaming support yet. Could add `createTaskWebSocket()` method.

3. **SDK README improvements** - Add more usage examples and API reference documentation.

4. **CLI tool** - Create a simple CLI that uses the SDK for common operations.

5. **OpenAPI spec** - Generate OpenAPI/Swagger documentation from the API.

## Running Tests
```bash
# Main service
npm test

# TypeScript SDK
cd sdk/typescript && npm test

# Python SDK
cd sdk/python && python3 -m pytest -v
```

All tests currently passing.
