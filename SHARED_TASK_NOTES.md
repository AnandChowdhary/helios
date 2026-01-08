# Helios - Shared Task Notes

## Current State

Queue integration is now complete. The core API with async task queueing is ready:

- TASK_QUEUE enabled in wrangler.toml
- Tasks with `output.mode: "async"` are queued for background processing
- Queue consumer handler processes messages and updates task status
- 71 tests passing (including 10 new queue integration tests)

## Next Priority Tasks

1. **Container Integration** - Implement Cloudflare Containers to actually execute Claude Code tasks
   - Create container/Dockerfile and entrypoint.sh
   - Wire up queue consumer to start containers
   - Stream container output to R2 for logs
2. **E2E Tests** - Add end-to-end tests against staging environment
3. **SSE Streaming** - Implement sync mode with Server-Sent Events

## Notes

- Queue consumer currently just updates status to "running" - actual container execution is a placeholder
- TaskQueueMessage includes all input needed for container execution (prompt, repo, claude config, options, webhook, git token)
- R2 is still commented out in wrangler.toml - uncomment when ready to store logs/diffs
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

test/
├── app.test.ts              # Schema validation tests
├── unit/
│   ├── auth.test.ts         # Auth middleware tests
│   ├── rateLimit.test.ts    # Rate limit middleware tests
│   ├── validate.test.ts     # Validation middleware tests
│   └── queueConsumer.test.ts # Queue consumer tests
└── integration/
    └── tasks.test.ts        # Task API integration tests (includes queue tests)
```
