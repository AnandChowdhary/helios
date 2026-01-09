# Helios - Shared Task Notes

## Current State

All Phase 1 and Phase 2 implementation is complete. Phase 3 is mostly complete.

**Deployed URLs:**

- **Production**: https://helios.getelysium.workers.dev
- **Staging**: https://helios-staging.getelysium.workers.dev

**Test Suite:** 150 tests (all passing)

## Recent Changes (This Iteration)

- Implemented WebSocket streaming (`GET /v1/tasks/stream`)
  - Full bidirectional WebSocket using native Cloudflare Workers WebSocketPair
  - Supports three auth methods: Authorization header, query param, Sec-WebSocket-Protocol header
  - Same task creation flow as SSE but over WebSocket
  - Client commands: ping, cancel
  - Server messages: connected, status, message, tool_use, tool_result, error, complete
  - Respects concurrent task limits (uses same counter as SSE/async)
  - Proper cleanup on connection close/error
  - 24 unit tests for the new feature

## What's Done

Phase 1, 2, and most of Phase 3:

- Core API (task creation, status, cancel, logs, diff, push)
- Authentication and rate limiting
- Concurrent task limits per account
- KV storage for task metadata
- R2 storage for artifacts
- Queue integration for async tasks
- SSE streaming for sync mode
- **WebSocket streaming** - NEW
- Webhook notifications
- Push-to-remote with PR creation
- Container Dockerfile and entrypoint
- Comprehensive test suite
- CI/CD pipelines
- TypeScript SDK (sdk/typescript/)
- Python SDK (sdk/python/)

## Remaining Phase 3 Tasks

- Usage tracking and billing
- Dashboard UI (optional)

## Key Files

```
src/routes/stream.ts                  # WebSocket stream handler (new)
src/types/index.ts                    # WebSocket types added (updated)
src/index.ts                          # Route registration (updated)
test/unit/websocket.test.ts           # WebSocket tests (new)
```

## WebSocket API Usage

```javascript
// Connect with API key in query param (browser-friendly)
const ws = new WebSocket("wss://helios.workers.dev/v1/tasks/stream?api_key=xxx");

// Or via Sec-WebSocket-Protocol (browser-friendly)
const ws = new WebSocket("wss://helios.workers.dev/v1/tasks/stream", ["api-key", "your-api-key"]);

ws.onopen = () => {
  // Send task config to start streaming
  ws.send(JSON.stringify({
    prompt: "Fix the bug",
    repository: { url: "https://github.com/user/repo", branch: "main" },
    claude: { apiKey: "sk-ant-...", model: "claude-sonnet-4-5", maxTurns: 10 }
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  // msg.type: connected | status | message | tool_use | tool_result | error | complete
  console.log(msg.type, msg.data);
};

// Cancel task
ws.send(JSON.stringify({ command: "cancel", taskId: "task_123" }));
```

## Notes

- WebSocket endpoint is at `/v1/tasks/stream` and is registered before the auth middleware since it handles its own authentication (WebSocket clients often cannot set Authorization headers)
- Uses Cloudflare Workers native WebSocketPair - no external dependencies
- Container SSE logs are transformed to WebSocket JSON messages
- Connection is single-task: one task per WebSocket connection
- To run multiple tasks, open multiple WebSocket connections
