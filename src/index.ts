import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { tasksRouter } from "./routes/tasks";
import { streamRouter } from "./routes/stream";
import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { errorHandler } from "./utils/errors";
import { handleQueue } from "./queue/consumer";
import type { Env, TaskQueueMessage } from "./types";

// Export the ClaudeRunner Durable Object class for container execution
export { ClaudeRunner } from "./container/runner";

const VERSION = "0.1.0";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());
app.use("*", logger());
app.onError(errorHandler);

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: VERSION,
  });
});

app.get("/", (c) => {
  return c.json({
    name: "Helios",
    description: "Cloud Claude Code API Service",
    version: VERSION,
    docs: "https://github.com/AnandChowdhary/helios",
  });
});

// WebSocket stream route is registered before auth middleware since it handles its own authentication
// (WebSocket clients often cannot set Authorization headers)
app.route("/v1/tasks/stream", streamRouter);

app.use("/v1/*", authMiddleware);
app.use("/v1/*", rateLimitMiddleware);
app.route("/v1/tasks", tasksRouter);

export default {
  fetch: app.fetch,
  queue(batch: MessageBatch<TaskQueueMessage>, env: Env): Promise<void> {
    return handleQueue(batch, env);
  },
};
