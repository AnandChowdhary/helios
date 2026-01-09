import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimitRouter } from "../../src/routes/rateLimit";
import { rateLimitMiddleware } from "../../src/middleware/rateLimit";
import type { ApiKey, Env } from "../../src/types";
import { errorHandler } from "../../src/utils/errors";

interface RateLimitInfoResponse {
  rateLimit: {
    limit: number;
    current: number;
    remaining: number;
    resetAt: string;
    resetAtUnix: number;
    windowMs: number;
  };
  concurrentTasks: {
    limit: number;
    active: number;
    remaining: number;
  };
}

describe("GET /v1/rate-limit", () => {
  let app: Hono<{ Bindings: Env }>;
  let mockRateLimitsKV: Map<string, string>;

  const testApiKey: ApiKey = {
    id: "key_test",
    name: "Test Key",
    keyHash: "test-hash",
    createdAt: new Date().toISOString(),
    rateLimit: 60,
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
    app.route("/v1/rate-limit", rateLimitRouter);
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

  it("returns rate limit info with correct structure", async () => {
    const env = createMockEnv();
    const res = await app.fetch(
      new Request("http://localhost/v1/rate-limit"),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as RateLimitInfoResponse;

    expect(body).toHaveProperty("rateLimit");
    expect(body).toHaveProperty("concurrentTasks");

    expect(body.rateLimit).toHaveProperty("limit");
    expect(body.rateLimit).toHaveProperty("current");
    expect(body.rateLimit).toHaveProperty("remaining");
    expect(body.rateLimit).toHaveProperty("resetAt");
    expect(body.rateLimit).toHaveProperty("resetAtUnix");
    expect(body.rateLimit).toHaveProperty("windowMs");

    expect(body.concurrentTasks).toHaveProperty("limit");
    expect(body.concurrentTasks).toHaveProperty("active");
    expect(body.concurrentTasks).toHaveProperty("remaining");
  });

  it("returns correct rate limit values when no requests made", async () => {
    const env = createMockEnv();
    const res = await app.fetch(
      new Request("http://localhost/v1/rate-limit"),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as RateLimitInfoResponse;

    expect(body.rateLimit.limit).toBe(60);
    expect(body.rateLimit.current).toBe(1); // This request counts
    expect(body.rateLimit.remaining).toBe(59);
    expect(body.rateLimit.windowMs).toBe(60000);
  });

  it("returns correct rate limit values with existing requests", async () => {
    const env = createMockEnv();

    // Simulate 10 previous requests
    const now = Date.now();
    const windowKey = `${testApiKey.id}:${Math.floor(now / 60000)}`;
    mockRateLimitsKV.set(windowKey, "10");

    const res = await app.fetch(
      new Request("http://localhost/v1/rate-limit"),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as RateLimitInfoResponse;

    // After the rate limit middleware increments, count will be 11
    expect(body.rateLimit.current).toBe(11);
    expect(body.rateLimit.remaining).toBe(49); // 60 - 11
  });

  it("returns correct concurrent task values when no active tasks", async () => {
    const env = createMockEnv();
    const res = await app.fetch(
      new Request("http://localhost/v1/rate-limit"),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as RateLimitInfoResponse;

    expect(body.concurrentTasks.limit).toBe(5);
    expect(body.concurrentTasks.active).toBe(0);
    expect(body.concurrentTasks.remaining).toBe(5);
  });

  it("returns correct concurrent task values with active tasks", async () => {
    const env = createMockEnv();

    // Simulate 3 active concurrent tasks
    mockRateLimitsKV.set(`concurrent:${testApiKey.id}`, "3");

    const res = await app.fetch(
      new Request("http://localhost/v1/rate-limit"),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as RateLimitInfoResponse;

    expect(body.concurrentTasks.limit).toBe(5);
    expect(body.concurrentTasks.active).toBe(3);
    expect(body.concurrentTasks.remaining).toBe(2);
  });

  it("returns valid ISO timestamp for resetAt", async () => {
    const env = createMockEnv();
    const res = await app.fetch(
      new Request("http://localhost/v1/rate-limit"),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as RateLimitInfoResponse;

    // Verify resetAt is a valid ISO date
    const resetDate = new Date(body.rateLimit.resetAt);
    expect(resetDate.getTime()).not.toBeNaN();

    // resetAtUnix should match the ISO timestamp
    expect(new Date(body.rateLimit.resetAtUnix).toISOString()).toBe(
      body.rateLimit.resetAt,
    );
  });

  it("returns reset time at next minute boundary", async () => {
    const env = createMockEnv();
    const now = Date.now();
    const expectedResetTime = (Math.floor(now / 60000) + 1) * 60000;

    const res = await app.fetch(
      new Request("http://localhost/v1/rate-limit"),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as RateLimitInfoResponse;

    // Allow for slight timing variations (within 1 second)
    expect(body.rateLimit.resetAtUnix).toBeGreaterThanOrEqual(expectedResetTime);
    expect(body.rateLimit.resetAtUnix).toBeLessThan(expectedResetTime + 60000);
  });

  it("handles API keys with different rate limits", async () => {
    const highLimitApiKey: ApiKey = {
      ...testApiKey,
      id: "key_high_limit",
      rateLimit: 1000,
      concurrentTaskLimit: 20,
    };

    // Create app with high limit key
    const highLimitApp = new Hono<{ Bindings: Env }>();
    highLimitApp.onError(errorHandler);
    highLimitApp.use("*", async (c, next) => {
      c.set("apiKey", highLimitApiKey);
      await next();
    });
    highLimitApp.use("*", rateLimitMiddleware);
    highLimitApp.route("/v1/rate-limit", rateLimitRouter);

    const env = createMockEnv();
    const res = await highLimitApp.fetch(
      new Request("http://localhost/v1/rate-limit"),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as RateLimitInfoResponse;

    expect(body.rateLimit.limit).toBe(1000);
    expect(body.concurrentTasks.limit).toBe(20);
  });

  it("includes rate limit headers in response", async () => {
    const env = createMockEnv();
    const res = await app.fetch(
      new Request("http://localhost/v1/rate-limit"),
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(res.headers.get("X-RateLimit-Remaining")).toBeDefined();
    expect(res.headers.get("X-RateLimit-Reset")).toBeDefined();
  });

  it("handles zero remaining correctly", async () => {
    const env = createMockEnv();

    // Set count to just below limit so this request brings it to limit
    const now = Date.now();
    const windowKey = `${testApiKey.id}:${Math.floor(now / 60000)}`;
    mockRateLimitsKV.set(windowKey, "59"); // One less than limit of 60

    const res = await app.fetch(
      new Request("http://localhost/v1/rate-limit"),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as RateLimitInfoResponse;

    // After this request, count is 60, so remaining is 0
    expect(body.rateLimit.current).toBe(60);
    expect(body.rateLimit.remaining).toBe(0);
  });

  it("uses default concurrent task limit when not specified", async () => {
    const noLimitApiKey: ApiKey = {
      id: "key_no_limit",
      name: "No Limit Key",
      keyHash: "test-hash",
      createdAt: new Date().toISOString(),
      rateLimit: 60,
      concurrentTaskLimit: undefined as unknown as number, // Force undefined
      enabled: true,
    };

    const noLimitApp = new Hono<{ Bindings: Env }>();
    noLimitApp.onError(errorHandler);
    noLimitApp.use("*", async (c, next) => {
      c.set("apiKey", noLimitApiKey);
      await next();
    });
    noLimitApp.use("*", rateLimitMiddleware);
    noLimitApp.route("/v1/rate-limit", rateLimitRouter);

    const env = createMockEnv();
    const res = await noLimitApp.fetch(
      new Request("http://localhost/v1/rate-limit"),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as RateLimitInfoResponse;

    // Default concurrent task limit is 5
    expect(body.concurrentTasks.limit).toBe(5);
  });
});
