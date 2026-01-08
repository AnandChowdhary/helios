# Helios - Shared Task Notes

## Current State

SSE streaming for sync mode is now implemented:

- Container server (`container/server.mjs`) exposes `/logs` endpoint for real-time SSE streaming
- Worker (`src/routes/tasks.ts`) handles sync mode by starting container and proxying log stream
- 101 tests passing

## How SSE Streaming Works

Sync mode flow:
1. POST /v1/tasks with `output.mode: "sync"` returns 200 with SSE stream
2. Worker starts container via `startContainerTask()`
3. Worker connects to container's `/logs` SSE endpoint
4. Container streams log events as they happen
5. On task completion, container sends `complete` event with result
6. Worker stops container after streaming completes

SSE Events:
- `status` - Task status updates (starting, running)
- `log` - Log messages from Claude Code
- `message` - Claude Code output
- `tool_use` - Tool usage events
- `result` - Intermediate results
- `complete` - Final result with success/failure
- `error` - Error events
- `timeout` - Stream timeout (10 min max)

Async mode still works as before (returns 202, queues task).

## Key Files

```
container/server.mjs      # HTTP server with /logs SSE endpoint
src/routes/tasks.ts       # POST handler with sync mode SSE streaming
src/container/runner.ts   # Container helpers including getContainerLogStream()
```

## Next Priority Tasks

1. **E2E Tests** - Add end-to-end tests against staging environment
   - Test actual container deployment with real Claude Code

2. **Production Deployment** - Deploy to Cloudflare and test
   - Set up KV namespaces, R2 bucket, Queue
   - Deploy container image to Cloudflare Container Registry

3. **Documentation** - Add usage examples and API docs

## Notes

- Sync mode returns 200 with `Content-Type: text/event-stream`
- Async mode returns 202 with JSON response
- Container log file is at `/tmp/task.log`
- Stream has 10-minute timeout built-in
- Container is stopped after streaming completes (or on error)
