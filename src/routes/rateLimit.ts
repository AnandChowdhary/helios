import { Hono } from "hono";
import type { Env, ApiKey } from "../types";
import {
  getActiveTaskCount,
  DEFAULT_CONCURRENT_TASK_LIMIT,
} from "../middleware/concurrentTaskLimit";

export const rateLimitRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /v1/rate-limit
 *
 * Returns the current rate limit status for the authenticated API key.
 * Note: This endpoint counts against the rate limit like other endpoints.
 */
rateLimitRouter.get("/", async (c) => {
  const apiKey = c.get("apiKey") as ApiKey;
  const now = Date.now();

  // Calculate rate limit window information
  const windowKey = `${apiKey.id}:${Math.floor(now / 60000)}`;
  const current = await c.env.RATE_LIMITS.get(windowKey);
  const requestCount = current ? parseInt(current, 10) : 0;

  // Reset time is the start of the next minute
  const resetAt = (Math.floor(now / 60000) + 1) * 60000;

  // Get concurrent task count
  const concurrentTaskLimit =
    apiKey.concurrentTaskLimit ?? DEFAULT_CONCURRENT_TASK_LIMIT;
  const activeTasks = await getActiveTaskCount(c.env, apiKey.id);

  return c.json({
    rateLimit: {
      limit: apiKey.rateLimit,
      current: requestCount,
      remaining: Math.max(0, apiKey.rateLimit - requestCount),
      resetAt: new Date(resetAt).toISOString(),
      resetAtUnix: resetAt,
      windowMs: 60000,
    },
    concurrentTasks: {
      limit: concurrentTaskLimit,
      active: activeTasks,
      remaining: Math.max(0, concurrentTaskLimit - activeTasks),
    },
  });
});
