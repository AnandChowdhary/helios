# Helios - Shared Task Notes

## Current State

Container HTTP server is now implemented for Cloudflare Containers communication:

- `server.mjs` - Node.js HTTP server exposing `/health`, `/status`, and `/result` endpoints on port 8080
- `entrypoint.sh` - Modified to start HTTP server in background and write results to `/tmp/result.json`
- `Dockerfile` - Updated to copy server.mjs and expose port 8080
- 99 tests passing

## How Container Communication Works

Cloudflare Containers communicate via HTTP, not stdout:

1. Container starts HTTP server on port 8080 (background process)
2. Task execution runs and writes status to `/tmp/status.json`
3. On completion, results written to `/tmp/result.json`
4. Worker fetches results via `container.fetch()` to `/result` endpoint
5. Container waits for Worker to stop it (or sleepAfter timeout)

Endpoints:
- `GET /health` - Returns `{"status":"healthy"}`
- `GET /status` - Returns current task status from `/tmp/status.json`
- `GET /result` - Returns task result from `/tmp/result.json` (404 if not ready)

## Next Priority Tasks

1. **SSE Streaming** - Implement sync mode with Server-Sent Events
   - For real-time streaming of Claude Code output
   - May need to add log streaming endpoint to container

2. **E2E Tests** - Add end-to-end tests against staging environment
   - Test actual container deployment

3. **Production Deployment** - Deploy to Cloudflare and test with real containers

## Key Files

```
container/server.mjs      # HTTP server for Cloudflare Containers
container/entrypoint.sh   # Task runner with HTTP server startup
container/Dockerfile      # Container image with port 8080 exposed
src/container/runner.ts   # ClaudeRunner class + helper functions
src/queue/consumer.ts     # Task processing with container execution
```

## Notes

- HTTP server runs as background process, killed on container exit
- Results written to /tmp for HTTP server to serve
- Container runs indefinitely after task completion - Worker must stop it
- Tests mock `@cloudflare/containers` since it requires CF Workers runtime
