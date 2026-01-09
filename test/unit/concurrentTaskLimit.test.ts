import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import {
  concurrentTaskLimitMiddleware,
  getActiveTaskCount,
  incrementActiveTaskCount,
  decrementActiveTaskCount,
} from "../../src/middleware/concurrentTaskLimit";
import { errorHandler } from "../../src/utils/errors";
import type { Env, ApiKey } from "../../src/types";

interface ErrorBody {
  error: { message: string };
}

interface SuccessBody {
  success: boolean;
}

let mockRateLimitsKV: Map<string, string>;

function createMockEnv(): Env {
  return {
    API_KEYS: {} as KVNamespace,
    TASKS: {} as KVNamespace,
    RATE_LIMITS: {
      get: vi.fn(async (key: string) => mockRateLimitsKV.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        mockRateLimitsKV.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        mockRateLimitsKV.delete(key);
      }),
      list: vi.fn(),
      getWithMetadata: vi.fn(),
    } as unknown as KVNamespace,
    USAGE: {} as KVNamespace,
    ARTIFACTS: {} as R2Bucket,
    CLAUDE_RUNNER: {} as DurableObjectNamespace,
    ENVIRONMENT: "test",
  };
}

describe("concurrentTaskLimitMiddleware", () => {
  let app: Hono<{ Bindings: Env }>;

  const testApiKey: ApiKey = {
    id: "key_test",
    name: "Test Key",
    keyHash: "test-hash",
    createdAt: new Date().toISOString(),
    rateLimit: 100,
    concurrentTaskLimit: 3,
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

    app.use("*", concurrentTaskLimitMiddleware);
    app.post("/test", (c) => c.json({ success: true }));
  });

  it("allows requests when under concurrent task limit", async () => {
    const env = createMockEnv();
    const res = await app.fetch(
      new Request("http://localhost/test", { method: "POST" }),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuccessBody;
    expect(body.success).toBe(true);
  });

  it("includes concurrent task headers", async () => {
    const env = createMockEnv();
    const res = await app.fetch(
      new Request("http://localhost/test", { method: "POST" }),
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Concurrent-Tasks")).toBe("0");
    expect(res.headers.get("X-Concurrent-Tasks-Limit")).toBe("3");
    expect(res.headers.get("X-Concurrent-Tasks-Remaining")).toBe("3");
  });

  it("shows correct remaining count with active tasks", async () => {
    const env = createMockEnv();
    mockRateLimitsKV.set(`concurrent:${testApiKey.id}`, "2");

    const res = await app.fetch(
      new Request("http://localhost/test", { method: "POST" }),
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Concurrent-Tasks")).toBe("2");
    expect(res.headers.get("X-Concurrent-Tasks-Remaining")).toBe("1");
  });

  it("rejects requests when concurrent task limit is reached", async () => {
    const env = createMockEnv();
    mockRateLimitsKV.set(`concurrent:${testApiKey.id}`, "3");

    const res = await app.fetch(
      new Request("http://localhost/test", { method: "POST" }),
      env,
    );

    expect(res.status).toBe(429);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.message).toContain("Concurrent task limit exceeded");
    expect(body.error.message).toContain("3 active tasks");
    expect(body.error.message).toContain("limit: 3");
  });

  it("rejects when over the limit", async () => {
    const env = createMockEnv();
    mockRateLimitsKV.set(`concurrent:${testApiKey.id}`, "5");

    const res = await app.fetch(
      new Request("http://localhost/test", { method: "POST" }),
      env,
    );

    expect(res.status).toBe(429);
  });

  it("uses default limit when concurrentTaskLimit is not set", async () => {
    const apiKeyWithoutLimit: ApiKey = {
      id: "key_no_limit",
      name: "No Limit Key",
      keyHash: "no-limit-hash",
      createdAt: new Date().toISOString(),
      rateLimit: 100,
      concurrentTaskLimit: undefined as unknown as number,
      enabled: true,
    };

    const appWithoutLimit = new Hono<{ Bindings: Env }>();
    appWithoutLimit.onError(errorHandler);
    appWithoutLimit.use("*", async (c, next) => {
      c.set("apiKey", apiKeyWithoutLimit);
      await next();
    });
    appWithoutLimit.use("*", concurrentTaskLimitMiddleware);
    appWithoutLimit.post("/test", (c) => c.json({ success: true }));

    const env = createMockEnv();
    // Set 4 active tasks - should still be under default limit of 5
    mockRateLimitsKV.set(`concurrent:${apiKeyWithoutLimit.id}`, "4");

    const res = await appWithoutLimit.fetch(
      new Request("http://localhost/test", { method: "POST" }),
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Concurrent-Tasks-Limit")).toBe("5");
  });
});

describe("getActiveTaskCount", () => {
  beforeEach(() => {
    mockRateLimitsKV = new Map();
  });

  it("returns 0 when no active tasks", async () => {
    const env = createMockEnv();
    const count = await getActiveTaskCount(env, "key_123");
    expect(count).toBe(0);
  });

  it("returns the correct count when tasks exist", async () => {
    const env = createMockEnv();
    mockRateLimitsKV.set("concurrent:key_123", "5");

    const count = await getActiveTaskCount(env, "key_123");
    expect(count).toBe(5);
  });
});

describe("incrementActiveTaskCount", () => {
  beforeEach(() => {
    mockRateLimitsKV = new Map();
  });

  it("increments from 0 to 1", async () => {
    const env = createMockEnv();
    const newCount = await incrementActiveTaskCount(env, "key_123");

    expect(newCount).toBe(1);
    expect(mockRateLimitsKV.get("concurrent:key_123")).toBe("1");
  });

  it("increments existing count", async () => {
    const env = createMockEnv();
    mockRateLimitsKV.set("concurrent:key_123", "3");

    const newCount = await incrementActiveTaskCount(env, "key_123");

    expect(newCount).toBe(4);
    expect(mockRateLimitsKV.get("concurrent:key_123")).toBe("4");
  });

  it("stores with TTL", async () => {
    const env = createMockEnv();
    const putSpy = vi.spyOn(env.RATE_LIMITS, "put");

    await incrementActiveTaskCount(env, "key_123");

    expect(putSpy).toHaveBeenCalledWith("concurrent:key_123", "1", {
      expirationTtl: 86400,
    });
  });
});

describe("decrementActiveTaskCount", () => {
  beforeEach(() => {
    mockRateLimitsKV = new Map();
  });

  it("decrements existing count", async () => {
    const env = createMockEnv();
    mockRateLimitsKV.set("concurrent:key_123", "3");

    const newCount = await decrementActiveTaskCount(env, "key_123");

    expect(newCount).toBe(2);
    expect(mockRateLimitsKV.get("concurrent:key_123")).toBe("2");
  });

  it("does not go below 0", async () => {
    const env = createMockEnv();
    mockRateLimitsKV.set("concurrent:key_123", "0");

    const newCount = await decrementActiveTaskCount(env, "key_123");

    expect(newCount).toBe(0);
  });

  it("handles decrement when key does not exist", async () => {
    const env = createMockEnv();

    const newCount = await decrementActiveTaskCount(env, "key_123");

    expect(newCount).toBe(0);
  });

  it("deletes key when count reaches 0", async () => {
    const env = createMockEnv();
    mockRateLimitsKV.set("concurrent:key_123", "1");
    const deleteSpy = vi.spyOn(env.RATE_LIMITS, "delete");

    await decrementActiveTaskCount(env, "key_123");

    expect(deleteSpy).toHaveBeenCalledWith("concurrent:key_123");
    expect(mockRateLimitsKV.has("concurrent:key_123")).toBe(false);
  });
});
