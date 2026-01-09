import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { ApiKey, Env } from "../types";

export const rateLimitMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const apiKey = c.get("apiKey") as ApiKey;
    const now = Date.now();
    const resetTime = (Math.floor(now / 60000) + 1) * 60000;

    // Always set rate limit headers (even when skipping enforcement)
    c.header("X-RateLimit-Limit", apiKey.rateLimit.toString());
    c.header("X-RateLimit-Reset", resetTime.toString());

    // Skip rate limit enforcement for keys with skipRateLimit flag
    if (apiKey.skipRateLimit) {
      c.header("X-RateLimit-Remaining", apiKey.rateLimit.toString());
      await next();
      return;
    }

    const windowKey = `${apiKey.id}:${Math.floor(now / 60000)}`; // 1-minute window

    // Get current count
    const current = await c.env.RATE_LIMITS.get(windowKey);
    const count = current ? parseInt(current, 10) : 0;

    // Set remaining header based on current usage
    c.header(
      "X-RateLimit-Remaining",
      Math.max(0, apiKey.rateLimit - count - 1).toString(),
    );

    if (count >= apiKey.rateLimit) {
      throw new HTTPException(429, {
        message: "Rate limit exceeded",
      });
    }

    // Increment counter (expire after 2 minutes)
    await c.env.RATE_LIMITS.put(windowKey, (count + 1).toString(), {
      expirationTtl: 120,
    });

    await next();
  },
);
