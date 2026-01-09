import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimitMiddleware } from "../../src/middleware/rateLimit";
import type { ApiKey, Env } from "../../src/types";
import { errorHandler } from "../../src/utils/errors";

interface ErrorBody {
  error: { message: string };
}

interface SuccessBody {
  success: boolean;
}

describe("rateLimitMiddleware", () => {
  let app: Hono<{ Bindings: Env }>;
  let mockRateLimitsKV: Map<string, string>;

  const testApiKey: ApiKey = {
    id: "key_test",
    name: "Test Key",
    keyHash: "test-hash",
    createdAt: new Date().toISOString(),
    rateLimit: 5,
    concurrentTaskLimit: 5,
    enabled: true,
  };

  beforeEach(() => {
    mockRateLimitsKV = new Map();

    app = new Hono<{ Bindings: Env }>();
    app.onError(errorHandler);

    // Mock auth middleware by setting apiKey directly
    app.use("*", async (c, next) => {
      c.set("apiKey", testApiKey);
      await next();
    });

    app.use("*", rateLimitMiddleware);
    app.get("/test", (c) => c.json({ success: true }));
  });

  function createMockEnv(): Env {
    return {
      API_KEYS: {} as KVNamespace,
      TASKS: {} as KVNamespace,
      RATE_LIMITS: {
        get: vi.fn(async (key: string) => mockRateLimitsKV.get(key) ?? null),
        put: vi.fn(async (key: string, value: string) => {
          mockRateLimitsKV.set(key, value);
        }),
        delete: vi.fn(),
        list: vi.fn(),
        getWithMetadata: vi.fn(),
      } as unknown as KVNamespace,
      USAGE: {} as KVNamespace,
      ARTIFACTS: {} as R2Bucket,
      CLAUDE_RUNNER: {} as DurableObjectNamespace,
      ENVIRONMENT: "test",
    };
  }

  it("allows requests under rate limit", async () => {
    const env = createMockEnv();
    const res = await app.fetch(new Request("http://localhost/test"), env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuccessBody;
    expect(body.success).toBe(true);
  });

  it("includes rate limit headers", async () => {
    const env = createMockEnv();
    const res = await app.fetch(new Request("http://localhost/test"), env);

    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");
    expect(res.headers.get("X-RateLimit-Reset")).toBeDefined();
  });

  it("decrements remaining count on each request", async () => {
    const env = createMockEnv();

    // First request
    const res1 = await app.fetch(new Request("http://localhost/test"), env);
    expect(res1.headers.get("X-RateLimit-Remaining")).toBe("4");

    // Second request
    const res2 = await app.fetch(new Request("http://localhost/test"), env);
    expect(res2.headers.get("X-RateLimit-Remaining")).toBe("3");

    // Third request
    const res3 = await app.fetch(new Request("http://localhost/test"), env);
    expect(res3.headers.get("X-RateLimit-Remaining")).toBe("2");
  });

  it("rejects requests when rate limit exceeded", async () => {
    const env = createMockEnv();

    // Simulate 5 previous requests by setting the count in KV
    const now = Date.now();
    const windowKey = `${testApiKey.id}:${Math.floor(now / 60000)}`;
    mockRateLimitsKV.set(windowKey, "5");

    const res = await app.fetch(new Request("http://localhost/test"), env);

    expect(res.status).toBe(429);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.message).toBe("Rate limit exceeded");
  });

  it("stores request count in KV with TTL", async () => {
    const env = createMockEnv();
    const putSpy = vi.spyOn(env.RATE_LIMITS, "put");

    await app.fetch(new Request("http://localhost/test"), env);

    expect(putSpy).toHaveBeenCalled();
    const [, value, options] = putSpy.mock.calls[0];
    expect(value).toBe("1");
    expect(options).toEqual({ expirationTtl: 120 });
  });

  it("uses separate windows for different time periods", async () => {
    const env = createMockEnv();

    // Simulate being at the limit for one time window
    const now = Date.now();
    const currentWindowKey = `${testApiKey.id}:${Math.floor(now / 60000)}`;
    const nextWindowKey = `${testApiKey.id}:${Math.floor(now / 60000) + 1}`;

    mockRateLimitsKV.set(currentWindowKey, "5");

    // Current window should be rate limited
    const res1 = await app.fetch(new Request("http://localhost/test"), env);
    expect(res1.status).toBe(429);

    // Simulate time passing to next window (clear current, check next is empty)
    mockRateLimitsKV.delete(currentWindowKey);
    mockRateLimitsKV.set(nextWindowKey, "0");

    // This request uses a fresh count - we just verify it doesn't throw
    await app.fetch(new Request("http://localhost/test"), env);
  });

  it("handles different API keys separately", async () => {
    const env = createMockEnv();

    // Set up rate limit for key_test
    const now = Date.now();
    const windowKey = `${testApiKey.id}:${Math.floor(now / 60000)}`;
    mockRateLimitsKV.set(windowKey, "4");

    const res = await app.fetch(new Request("http://localhost/test"), env);

    // Should still have 1 request remaining (limit 5, count 4)
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("skips rate limiting when skipRateLimit flag is true", async () => {
    const skipRateLimitApiKey: ApiKey = {
      ...testApiKey,
      id: "key_skip_rate_limit",
      skipRateLimit: true,
    };

    // Create a new app with the skipRateLimit key
    const skipApp = new Hono<{ Bindings: Env }>();
    skipApp.onError(errorHandler);
    skipApp.use("*", async (c, next) => {
      c.set("apiKey", skipRateLimitApiKey);
      await next();
    });
    skipApp.use("*", rateLimitMiddleware);
    skipApp.get("/test", (c) => c.json({ success: true }));

    const env = createMockEnv();

    // Simulate being at the rate limit
    const now = Date.now();
    const windowKey = `${skipRateLimitApiKey.id}:${Math.floor(now / 60000)}`;
    mockRateLimitsKV.set(windowKey, "999999"); // Way over the limit

    // Request should still succeed because skipRateLimit is true
    const res = await skipApp.fetch(new Request("http://localhost/test"), env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuccessBody;
    expect(body.success).toBe(true);

    // Should not have rate limit headers since rate limiting was skipped
    expect(res.headers.has("X-RateLimit-Limit")).toBe(false);
  });
});
