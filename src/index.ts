import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { tasksRouter } from "./routes/tasks";
import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { errorHandler } from "./utils/errors";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use("*", cors());
app.use("*", logger());
app.onError(errorHandler);

// Public routes
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  });
});

app.get("/", (c) => {
  return c.json({
    name: "Helios",
    description: "Cloud Claude Code API Service",
    version: "0.1.0",
    docs: "https://github.com/AnandChowdhary/helios",
  });
});

// Protected routes
app.use("/v1/*", authMiddleware);
app.use("/v1/*", rateLimitMiddleware);
app.route("/v1/tasks", tasksRouter);

export default app;
