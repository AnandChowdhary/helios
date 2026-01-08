import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env, ApiKey } from "../types";

export const rateLimitMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const apiKey = c.get("apiKey") as ApiKey;
    const now = Date.now();
    const windowKey = `${apiKey.id}:${Math.floor(now / 60000)}`; // 1-minute window

    // Get current count
    const current = await c.env.RATE_LIMITS.get(windowKey);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= apiKey.rateLimit) {
      throw new HTTPException(429, {
        message: "Rate limit exceeded",
      });
    }

    // Increment counter (expire after 2 minutes)
    await c.env.RATE_LIMITS.put(windowKey, (count + 1).toString(), {
      expirationTtl: 120,
    });

    // Add rate limit headers
    c.header("X-RateLimit-Limit", apiKey.rateLimit.toString());
    c.header(
      "X-RateLimit-Remaining",
      (apiKey.rateLimit - count - 1).toString()
    );
    c.header(
      "X-RateLimit-Reset",
      ((Math.floor(now / 60000) + 1) * 60000).toString()
    );

    await next();
  }
);
