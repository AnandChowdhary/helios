import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { authMiddleware, hashApiKey } from "../../src/middleware/auth";
import { errorHandler } from "../../src/utils/errors";
import type { Env, ApiKey } from "../../src/types";

interface ErrorBody {
  error: { message: string };
}

interface SuccessBody {
  success: boolean;
  apiKey?: ApiKey;
}

describe("hashApiKey", () => {
  it("hashes an API key to a hex string", async () => {
    const hash = await hashApiKey("test-key");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces consistent hashes", async () => {
    const hash1 = await hashApiKey("test-key");
    const hash2 = await hashApiKey("test-key");
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different keys", async () => {
    const hash1 = await hashApiKey("key-1");
    const hash2 = await hashApiKey("key-2");
    expect(hash1).not.toBe(hash2);
  });
});

describe("authMiddleware", () => {
  let app: Hono<{ Bindings: Env }>;
  let mockKV: Map<string, string>;

  const validApiKey: ApiKey = {
    id: "key_test",
    name: "Test Key",
    keyHash: "",
    createdAt: new Date().toISOString(),
    rateLimit: 100,
    enabled: true,
  };

  beforeEach(async () => {
    mockKV = new Map();
    const keyHash = await hashApiKey("valid-api-key");
    validApiKey.keyHash = keyHash;
    mockKV.set(keyHash, JSON.stringify(validApiKey));

    app = new Hono<{ Bindings: Env }>();
    app.onError(errorHandler);
    app.use("*", authMiddleware);
    app.get("/test", (c) => c.json({ success: true, apiKey: c.get("apiKey") }));
  });

  function createMockEnv(): Env {
    return {
      API_KEYS: {
        get: vi.fn(async (key: string, format?: string) => {
          const value = mockKV.get(key);
          if (!value) return null;
          return format === "json" ? JSON.parse(value) : value;
        }),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        getWithMetadata: vi.fn(),
      } as unknown as KVNamespace,
      TASKS: {} as KVNamespace,
      RATE_LIMITS: {} as KVNamespace,
      ENVIRONMENT: "test",
    };
  }

  it("rejects requests without Authorization header", async () => {
    const env = createMockEnv();
    const res = await app.fetch(
      new Request("http://localhost/test"),
      env
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.message).toBe("Missing API key");
  });

  it("rejects requests with non-Bearer auth", async () => {
    const env = createMockEnv();
    const res = await app.fetch(
      new Request("http://localhost/test", {
        headers: { Authorization: "Basic dXNlcjpwYXNz" },
      }),
      env
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.message).toBe("Missing API key");
  });

  it("rejects invalid API keys", async () => {
    const env = createMockEnv();
    const res = await app.fetch(
      new Request("http://localhost/test", {
        headers: { Authorization: "Bearer invalid-key" },
      }),
      env
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.message).toBe("Invalid API key");
  });

  it("rejects disabled API keys", async () => {
    const disabledKey = { ...validApiKey, enabled: false };
    const keyHash = await hashApiKey("disabled-key");
    mockKV.set(keyHash, JSON.stringify(disabledKey));

    const env = createMockEnv();
    const res = await app.fetch(
      new Request("http://localhost/test", {
        headers: { Authorization: "Bearer disabled-key" },
      }),
      env
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.message).toBe("Invalid API key");
  });

  it("accepts valid API keys", async () => {
    const env = createMockEnv();
    const res = await app.fetch(
      new Request("http://localhost/test", {
        headers: { Authorization: "Bearer valid-api-key" },
      }),
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuccessBody;
    expect(body.success).toBe(true);
  });

  it("sets apiKey in context for valid requests", async () => {
    const env = createMockEnv();
    const res = await app.fetch(
      new Request("http://localhost/test", {
        headers: { Authorization: "Bearer valid-api-key" },
      }),
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuccessBody;
    expect(body.apiKey).toBeDefined();
    expect(body.apiKey?.id).toBe("key_test");
    expect(body.apiKey?.enabled).toBe(true);
  });
});
