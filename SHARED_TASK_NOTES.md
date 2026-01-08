# Helios - Shared Task Notes

## Current State

Container files (Dockerfile and entrypoint.sh) are now complete. The core API with async task queueing is ready:

- TASK_QUEUE enabled in wrangler.toml
- Tasks with `output.mode: "async"` are queued for background processing
- Queue consumer handler processes messages and updates task status
- Container image (`container/Dockerfile`) ready for Claude Code execution
- Entrypoint script handles git clone, Claude Code execution, and result collection
- 88 tests passing (including 17 new container tests)

## Next Priority Tasks

1. **Container Integration with Worker** - Wire up queue consumer to actually start containers
   - Add `CLAUDE_RUNNER` container binding to Env type
   - Update queue consumer to start containers with environment variables
   - Stream container output to R2 for logs
2. **R2 Storage** - Uncomment R2 binding in wrangler.toml and implement artifact storage
3. **SSE Streaming** - Implement sync mode with Server-Sent Events
4. **E2E Tests** - Add end-to-end tests against staging environment

## Notes

- Queue consumer currently just updates status to "running" - actual container execution is a placeholder
- TaskQueueMessage includes all input needed for container execution (prompt, repo, claude config, options, webhook, git token)
- R2 is still commented out in wrangler.toml - uncomment when ready to store logs/diffs
- Container entrypoint outputs structured JSON events that the Worker can parse
- Zod v4 has breaking changes vs v3 - cannot use `.default({})` on objects with required fields that have their own defaults
- Test error responses use `body.error.message` format from the errorHandler

## File Structure

```
src/
├── index.ts           # Main app entry, route setup, exports worker
├── types/index.ts     # TypeScript types (Env, Task, TaskQueueMessage, etc.)
├── schemas/task.ts    # Zod validation schemas
├── middleware/
│   ├── auth.ts        # API key authentication
│   ├── rateLimit.ts   # Per-key rate limiting
│   └── validate.ts    # Request body validation
├── queue/
│   └── consumer.ts    # Queue message handler
├── routes/
│   └── tasks.ts       # Task API routes (queues async tasks)
└── utils/
    └── errors.ts      # Error handling

container/
├── Dockerfile         # Claude Code runner container image
└── entrypoint.sh      # Container startup script (clone, run, collect results)

test/
├── app.test.ts              # Schema validation tests
├── unit/
│   ├── auth.test.ts         # Auth middleware tests
│   ├── rateLimit.test.ts    # Rate limit middleware tests
│   ├── validate.test.ts     # Validation middleware tests
│   ├── queueConsumer.test.ts # Queue consumer tests
│   └── container.test.ts    # Container file tests
└── integration/
    └── tasks.test.ts        # Task API integration tests (includes queue tests)
```
