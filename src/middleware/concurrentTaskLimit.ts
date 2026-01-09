import { createMiddleware } from "hono/factory";
import type { Env, ApiKey } from "../types";
import { createError, ErrorCodes } from "../utils/errors";

export const DEFAULT_CONCURRENT_TASK_LIMIT = 5;

/**
 * Gets the current count of active (pending or running) tasks for an API key.
 */
export async function getActiveTaskCount(
  env: Env,
  apiKeyId: string,
): Promise<number> {
  const countStr = await env.RATE_LIMITS.get(`concurrent:${apiKeyId}`);
  return countStr ? parseInt(countStr, 10) : 0;
}

/**
 * Increments the concurrent task count for an API key.
 * Returns the new count.
 */
export async function incrementActiveTaskCount(
  env: Env,
  apiKeyId: string,
): Promise<number> {
  const current = await getActiveTaskCount(env, apiKeyId);
  const newCount = current + 1;
  // Store with a long TTL (24 hours) - tasks should complete well within this
  // The counter will be decremented when tasks complete
  await env.RATE_LIMITS.put(`concurrent:${apiKeyId}`, newCount.toString(), {
    expirationTtl: 86400,
  });
  return newCount;
}

/**
 * Decrements the concurrent task count for an API key.
 * Will not go below 0.
 */
export async function decrementActiveTaskCount(
  env: Env,
  apiKeyId: string,
): Promise<number> {
  const current = await getActiveTaskCount(env, apiKeyId);
  const newCount = Math.max(0, current - 1);
  if (newCount === 0) {
    // Clean up the key when count reaches 0
    await env.RATE_LIMITS.delete(`concurrent:${apiKeyId}`);
  } else {
    await env.RATE_LIMITS.put(`concurrent:${apiKeyId}`, newCount.toString(), {
      expirationTtl: 86400,
    });
  }
  return newCount;
}

/**
 * Middleware that enforces concurrent task limits per API key.
 * This should be applied only to the POST /v1/tasks endpoint.
 *
 * Note: This middleware only checks the limit. The actual increment
 * happens in the task route after the task is created to ensure
 * atomicity with task creation.
 */
export const concurrentTaskLimitMiddleware = createMiddleware<{
  Bindings: Env;
}>(async (c, next) => {
  const apiKey = c.get("apiKey") as ApiKey;
  const limit = apiKey.concurrentTaskLimit ?? DEFAULT_CONCURRENT_TASK_LIMIT;

  const currentCount = await getActiveTaskCount(c.env, apiKey.id);

  // Add headers with concurrent task info (always, even when skipping limit check)
  c.header("X-Concurrent-Tasks", currentCount.toString());
  c.header("X-Concurrent-Tasks-Limit", limit.toString());
  c.header("X-Concurrent-Tasks-Remaining", (limit - currentCount).toString());

  // Skip concurrent limit check if flag is set
  if (apiKey.skipConcurrentLimit) {
    await next();
    return;
  }

  if (currentCount >= limit) {
    throw createError(
      ErrorCodes.CONCURRENT_LIMIT_EXCEEDED,
      `Concurrent task limit exceeded. You have ${currentCount} active tasks (limit: ${limit}). Please wait for tasks to complete before starting new ones.`,
      { currentCount, limit },
    );
  }

  await next();
});
