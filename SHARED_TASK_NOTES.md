# Helios - Shared Task Notes

## Current State

Container integration with Worker is now implemented:

- `ClaudeRunner` container class extending `@cloudflare/containers`
- Queue consumer starts containers with task config via `startAndWaitForPorts()`
- R2 storage binding enabled for artifacts (diff, result.json)
- Webhook notifications sent on task completion/failure
- 88 tests passing

## Architecture Note: Cloudflare Containers

Cloudflare Containers use an HTTP-based communication model, not stdout streaming:
- Container is a Durable Object that controls a Docker container
- Worker communicates with container via `fetch()` to container's HTTP port
- The container needs to expose an HTTP server on port 8080 (or configurable port)

**Current container entrypoint.sh outputs to stdout, but Cloudflare Containers can't capture stdout directly.**

To complete the integration, the container needs modification to either:
1. Expose an HTTP server that returns task results via `/result` endpoint
2. Write results to a shared location that the Worker can access

## Next Priority Tasks

1. **Container HTTP Server** - Add simple HTTP server to container entrypoint
   - Expose port 8080 with `/result` and `/health` endpoints
   - Store Claude Code output in a file, serve via HTTP
   - This is required for the `getContainerResult()` function to work

2. **SSE Streaming** - Implement sync mode with Server-Sent Events
   - For real-time streaming of Claude Code output

3. **E2E Tests** - Add end-to-end tests against staging environment
   - Test actual container deployment

4. **Production Deployment** - Deploy to Cloudflare and test with real containers

## Key Files

```
src/container/runner.ts   # ClaudeRunner class + helper functions
src/queue/consumer.ts     # Task processing with container execution
src/types/index.ts        # Env type with CLAUDE_RUNNER binding
wrangler.toml             # R2 + Container + DO bindings configured
```

## Notes

- `@cloudflare/containers` package installed (v0.0.31)
- Container config in wrangler.toml uses `[[containers]]` array syntax
- DO binding uses `new_sqlite_classes` for container-enabled DOs
- Integration tests mock `@cloudflare/containers` since it requires CF Workers runtime
- Zod v4 breaking changes - cannot use `.default({})` on objects with required fields
