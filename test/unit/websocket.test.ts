import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env, ApiKey, WebSocketStreamMessage } from "../../src/types";
import { hashApiKey } from "../../src/middleware/auth";

// Mock the container module before importing stream
vi.mock("../../src/container/runner", () => ({
  startContainerTask: vi.fn(),
  getContainerLogStream: vi.fn(),
  stopContainerTask: vi.fn(),
}));

// Import after mocking
import {
  createMessage,
  validateApiKey,
  checkConcurrentLimit,
  streamRouter,
} from "../../src/routes/stream";
import { Hono } from "hono";

describe("WebSocket Stream", () => {
  describe("createMessage", () => {
    it("creates a properly formatted message", () => {
      const message = createMessage("status", "task_123", {
        status: "running",
      });
      const parsed = JSON.parse(message) as WebSocketStreamMessage;

      expect(parsed.type).toBe("status");
      expect(parsed.taskId).toBe("task_123");
      expect(parsed.data.status).toBe("running");
      expect(parsed.timestamp).toBeDefined();
      expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
    });

    it("creates connected message with empty taskId", () => {
      const message = createMessage("connected", "", {
        message: "Connected",
      });
      const parsed = JSON.parse(message) as WebSocketStreamMessage;

      expect(parsed.type).toBe("connected");
      expect(parsed.taskId).toBe("");
      expect(parsed.data.message).toBe("Connected");
    });

    it("creates error message with error details", () => {
      const message = createMessage("error", "task_456", {
        code: "TASK_ERROR",
        message: "Something went wrong",
      });
      const parsed = JSON.parse(message) as WebSocketStreamMessage;

      expect(parsed.type).toBe("error");
      expect(parsed.taskId).toBe("task_456");
      expect(parsed.data.code).toBe("TASK_ERROR");
      expect(parsed.data.message).toBe("Something went wrong");
    });

    it("creates complete message with result data", () => {
      const message = createMessage("complete", "task_789", {
        success: true,
        summary: "Task completed successfully",
        filesChanged: [{ path: "src/index.ts", additions: 10, deletions: 5 }],
      });
      const parsed = JSON.parse(message) as WebSocketStreamMessage;

      expect(parsed.type).toBe("complete");
      expect(parsed.taskId).toBe("task_789");
      expect(parsed.data.success).toBe(true);
      expect(parsed.data.filesChanged).toHaveLength(1);
    });

    it("includes all message types", () => {
      const types: WebSocketStreamMessage["type"][] = [
        "connected",
        "status",
        "message",
        "tool_use",
        "tool_result",
        "error",
        "complete",
      ];

      for (const type of types) {
        const message = createMessage(type, "task_test", { data: "test" });
        const parsed = JSON.parse(message) as WebSocketStreamMessage;
        expect(parsed.type).toBe(type);
      }
    });
  });

  describe("validateApiKey", () => {
    let mockKV: Map<string, string>;
    let mockEnv: Env;
    const validApiKey: ApiKey = {
      id: "key_test",
      name: "Test Key",
      keyHash: "",
      createdAt: new Date().toISOString(),
      rateLimit: 100,
      concurrentTaskLimit: 5,
      enabled: true,
    };

    beforeEach(async () => {
      mockKV = new Map();
      const keyHash = await hashApiKey("valid-api-key");
      validApiKey.keyHash = keyHash;
      mockKV.set(keyHash, JSON.stringify(validApiKey));

      mockEnv = {
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
        USAGE: {} as KVNamespace,
        ARTIFACTS: {} as R2Bucket,
        CLAUDE_RUNNER: {} as DurableObjectNamespace,
        ENVIRONMENT: "test",
      };
    });

    it("validates API key from Authorization header", async () => {
      const request = new Request("http://localhost/v1/tasks/stream", {
        headers: {
          Authorization: "Bearer valid-api-key",
          Upgrade: "websocket",
        },
      });

      const result = await validateApiKey(mockEnv, request);
      expect(result).not.toBeNull();
      expect(result?.id).toBe("key_test");
    });

    it("validates API key from query parameter", async () => {
      const request = new Request(
        "http://localhost/v1/tasks/stream?api_key=valid-api-key",
        {
          headers: {
            Upgrade: "websocket",
          },
        },
      );

      const result = await validateApiKey(mockEnv, request);
      expect(result).not.toBeNull();
      expect(result?.id).toBe("key_test");
    });

    it("validates API key from Sec-WebSocket-Protocol header", async () => {
      const request = new Request("http://localhost/v1/tasks/stream", {
        headers: {
          Upgrade: "websocket",
          "Sec-WebSocket-Protocol": "api-key, valid-api-key",
        },
      });

      const result = await validateApiKey(mockEnv, request);
      expect(result).not.toBeNull();
      expect(result?.id).toBe("key_test");
    });

    it("returns null for invalid API key", async () => {
      const request = new Request("http://localhost/v1/tasks/stream", {
        headers: {
          Authorization: "Bearer invalid-key",
          Upgrade: "websocket",
        },
      });

      const result = await validateApiKey(mockEnv, request);
      expect(result).toBeNull();
    });

    it("returns null for missing API key", async () => {
      const request = new Request("http://localhost/v1/tasks/stream", {
        headers: {
          Upgrade: "websocket",
        },
      });

      const result = await validateApiKey(mockEnv, request);
      expect(result).toBeNull();
    });

    it("returns null for disabled API key", async () => {
      const disabledKey = { ...validApiKey, enabled: false };
      const keyHash = await hashApiKey("disabled-key");
      mockKV.set(keyHash, JSON.stringify(disabledKey));

      const request = new Request("http://localhost/v1/tasks/stream", {
        headers: {
          Authorization: "Bearer disabled-key",
          Upgrade: "websocket",
        },
      });

      const result = await validateApiKey(mockEnv, request);
      expect(result).toBeNull();
    });

    it("prioritizes Authorization header over query param", async () => {
      // Add another key via query param
      const queryKeyHash = await hashApiKey("query-api-key");
      const queryKey = { ...validApiKey, id: "key_query" };
      mockKV.set(queryKeyHash, JSON.stringify(queryKey));

      const request = new Request(
        "http://localhost/v1/tasks/stream?api_key=query-api-key",
        {
          headers: {
            Authorization: "Bearer valid-api-key",
            Upgrade: "websocket",
          },
        },
      );

      const result = await validateApiKey(mockEnv, request);
      expect(result?.id).toBe("key_test"); // Authorization header takes priority
    });

    it("falls back to query param when Authorization header invalid", async () => {
      const queryKeyHash = await hashApiKey("query-api-key");
      const queryKey = { ...validApiKey, id: "key_query" };
      mockKV.set(queryKeyHash, JSON.stringify(queryKey));

      const request = new Request(
        "http://localhost/v1/tasks/stream?api_key=query-api-key",
        {
          headers: {
            Authorization: "Bearer invalid-key",
            Upgrade: "websocket",
          },
        },
      );

      const result = await validateApiKey(mockEnv, request);
      expect(result?.id).toBe("key_query"); // Falls back to query param
    });
  });

  describe("checkConcurrentLimit", () => {
    let mockEnv: Env;
    let mockRateLimitsKV: Map<string, string>;

    beforeEach(() => {
      mockRateLimitsKV = new Map();

      mockEnv = {
        API_KEYS: {} as KVNamespace,
        TASKS: {} as KVNamespace,
        RATE_LIMITS: {
          get: vi.fn(async (key: string) => mockRateLimitsKV.get(key) || null),
          put: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          getWithMetadata: vi.fn(),
        } as unknown as KVNamespace,
        USAGE: {} as KVNamespace,
        ARTIFACTS: {} as R2Bucket,
        CLAUDE_RUNNER: {} as DurableObjectNamespace,
        ENVIRONMENT: "test",
      };
    });

    it("allows request when under limit", async () => {
      mockRateLimitsKV.set("concurrent:key_test", "2");

      const apiKey: ApiKey = {
        id: "key_test",
        name: "Test Key",
        keyHash: "hash",
        createdAt: new Date().toISOString(),
        rateLimit: 100,
        concurrentTaskLimit: 5,
        enabled: true,
      };

      const result = await checkConcurrentLimit(mockEnv, apiKey);
      expect(result.allowed).toBe(true);
      expect(result.current).toBe(2);
      expect(result.limit).toBe(5);
    });

    it("rejects request when at limit", async () => {
      mockRateLimitsKV.set("concurrent:key_test", "5");

      const apiKey: ApiKey = {
        id: "key_test",
        name: "Test Key",
        keyHash: "hash",
        createdAt: new Date().toISOString(),
        rateLimit: 100,
        concurrentTaskLimit: 5,
        enabled: true,
      };

      const result = await checkConcurrentLimit(mockEnv, apiKey);
      expect(result.allowed).toBe(false);
      expect(result.current).toBe(5);
      expect(result.limit).toBe(5);
    });

    it("rejects request when over limit", async () => {
      mockRateLimitsKV.set("concurrent:key_test", "10");

      const apiKey: ApiKey = {
        id: "key_test",
        name: "Test Key",
        keyHash: "hash",
        createdAt: new Date().toISOString(),
        rateLimit: 100,
        concurrentTaskLimit: 5,
        enabled: true,
      };

      const result = await checkConcurrentLimit(mockEnv, apiKey);
      expect(result.allowed).toBe(false);
      expect(result.current).toBe(10);
      expect(result.limit).toBe(5);
    });

    it("allows request when no tasks running", async () => {
      const apiKey: ApiKey = {
        id: "key_test",
        name: "Test Key",
        keyHash: "hash",
        createdAt: new Date().toISOString(),
        rateLimit: 100,
        concurrentTaskLimit: 5,
        enabled: true,
      };

      const result = await checkConcurrentLimit(mockEnv, apiKey);
      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
      expect(result.limit).toBe(5);
    });

    it("uses default limit of 5 when concurrentTaskLimit not set", async () => {
      const apiKey = {
        id: "key_test",
        name: "Test Key",
        keyHash: "hash",
        createdAt: new Date().toISOString(),
        rateLimit: 100,
        enabled: true,
      } as ApiKey;

      const result = await checkConcurrentLimit(mockEnv, apiKey);
      expect(result.limit).toBe(5); // default limit
    });

    it("respects custom concurrent limit", async () => {
      mockRateLimitsKV.set("concurrent:key_test", "9");

      const apiKey: ApiKey = {
        id: "key_test",
        name: "Test Key",
        keyHash: "hash",
        createdAt: new Date().toISOString(),
        rateLimit: 100,
        concurrentTaskLimit: 10,
        enabled: true,
      };

      const result = await checkConcurrentLimit(mockEnv, apiKey);
      expect(result.allowed).toBe(true);
      expect(result.current).toBe(9);
      expect(result.limit).toBe(10);
    });
  });

  describe("WebSocket endpoint", () => {
    let app: Hono<{ Bindings: Env }>;
    let mockKV: Map<string, string>;
    let mockRateLimitsKV: Map<string, string>;
    const validApiKey: ApiKey = {
      id: "key_test",
      name: "Test Key",
      keyHash: "",
      createdAt: new Date().toISOString(),
      rateLimit: 100,
      concurrentTaskLimit: 5,
      enabled: true,
    };

    beforeEach(async () => {
      mockKV = new Map();
      mockRateLimitsKV = new Map();
      const keyHash = await hashApiKey("valid-api-key");
      validApiKey.keyHash = keyHash;
      mockKV.set(keyHash, JSON.stringify(validApiKey));

      app = new Hono<{ Bindings: Env }>();
      app.route("/", streamRouter);
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
        TASKS: {
          get: vi.fn(async () => null),
          put: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          getWithMetadata: vi.fn(),
        } as unknown as KVNamespace,
        RATE_LIMITS: {
          get: vi.fn(async (key: string) => mockRateLimitsKV.get(key) || null),
          put: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          getWithMetadata: vi.fn(),
        } as unknown as KVNamespace,
        USAGE: {
          get: vi.fn(async () => null),
          put: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          getWithMetadata: vi.fn(),
        } as unknown as KVNamespace,
        ARTIFACTS: {} as R2Bucket,
        CLAUDE_RUNNER: {} as DurableObjectNamespace,
        ENVIRONMENT: "test",
      };
    }

    it("returns 426 when Upgrade header is missing", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        new Request("http://localhost/", {
          headers: {
            Authorization: "Bearer valid-api-key",
          },
        }),
        env,
      );

      expect(res.status).toBe(426);
      const body = (await res.json()) as { error: { message: string } };
      expect(body.error.message).toContain("WebSocket upgrade");
    });

    it("returns 426 when Upgrade header is wrong value", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        new Request("http://localhost/", {
          headers: {
            Authorization: "Bearer valid-api-key",
            Upgrade: "http/2.0",
          },
        }),
        env,
      );

      expect(res.status).toBe(426);
    });

    it("returns 401 when API key is invalid", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        new Request("http://localhost/", {
          headers: {
            Upgrade: "websocket",
            Authorization: "Bearer invalid-key",
          },
        }),
        env,
      );

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: { message: string } };
      expect(body.error.message).toContain("Invalid or missing API key");
    });

    it("returns 401 when API key is missing", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        new Request("http://localhost/", {
          headers: {
            Upgrade: "websocket",
          },
        }),
        env,
      );

      expect(res.status).toBe(401);
    });

    it("accepts different auth methods for websocket", async () => {
      const env = createMockEnv();

      // Authorization header
      let res = await app.fetch(
        new Request("http://localhost/", {
          headers: {
            Upgrade: "websocket",
            Authorization: "Bearer invalid-key",
          },
        }),
        env,
      );
      expect(res.status).toBe(401);

      // Query parameter - invalid key
      res = await app.fetch(
        new Request("http://localhost/?api_key=invalid-key", {
          headers: {
            Upgrade: "websocket",
          },
        }),
        env,
      );
      expect(res.status).toBe(401);

      // Sec-WebSocket-Protocol header - invalid key
      res = await app.fetch(
        new Request("http://localhost/", {
          headers: {
            Upgrade: "websocket",
            "Sec-WebSocket-Protocol": "api-key, invalid-key",
          },
        }),
        env,
      );
      expect(res.status).toBe(401);
    });
  });
});
