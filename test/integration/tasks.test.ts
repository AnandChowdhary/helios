import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock @cloudflare/containers before importing the app
vi.mock("@cloudflare/containers", () => ({
  Container: class MockContainer {
    defaultPort = 8080;
    sleepAfter = "5m";
    enableInternet = true;
    async fetch() {
      return new Response("{}");
    }
  },
  getRandom: vi.fn(),
  loadBalance: vi.fn(),
  getContainer: vi.fn(),
  switchPort: vi.fn(),
}));

import app from "../../src/index";
import type { Env, Task, ApiKey } from "../../src/types";
import { hashApiKey } from "../../src/middleware/auth";

interface ErrorBody {
  error: { message: string };
}

interface TaskCreatedBody {
  taskId: string;
  status: string;
  createdAt: string;
  statusUrl: string;
}

interface TaskBody {
  id: string;
  status: string;
}

interface CancelledBody {
  taskId: string;
  status: string;
  cancelledAt: string;
}

interface HealthBody {
  status: string;
  timestamp: string;
  version: string;
}

interface ServiceInfoBody {
  name: string;
}

describe("Tasks API Integration", () => {
  let mockTasksKV: Map<string, string>;
  let mockApiKeysKV: Map<string, string>;
  let mockRateLimitsKV: Map<string, string>;
  let testApiKeyHash: string;

  const validPayload = {
    prompt: "Fix the authentication bug",
    repository: {
      url: "https://github.com/user/repo",
      branch: "main",
    },
    claude: {
      apiKey: "sk-ant-api03-test-key",
      model: "claude-sonnet-4-5",
    },
  };

  const testApiKey: ApiKey = {
    id: "key_test",
    name: "Test Key",
    keyHash: "",
    createdAt: new Date().toISOString(),
    rateLimit: 100,
    enabled: true,
  };

  beforeEach(async () => {
    mockTasksKV = new Map();
    mockApiKeysKV = new Map();
    mockRateLimitsKV = new Map();

    // Set up valid API key
    testApiKeyHash = await hashApiKey("test-api-key");
    testApiKey.keyHash = testApiKeyHash;
    mockApiKeysKV.set(testApiKeyHash, JSON.stringify(testApiKey));
  });

  function createMockEnv(): Env {
    return {
      TASKS: {
        get: vi.fn(async (key: string, format?: string) => {
          const value = mockTasksKV.get(key);
          if (!value) return null;
          return format === "json" ? JSON.parse(value) : value;
        }),
        put: vi.fn(async (key: string, value: string) => {
          mockTasksKV.set(key, value);
        }),
        delete: vi.fn(),
        list: vi.fn(),
        getWithMetadata: vi.fn(),
      } as unknown as KVNamespace,
      API_KEYS: {
        get: vi.fn(async (key: string, format?: string) => {
          const value = mockApiKeysKV.get(key);
          if (!value) return null;
          return format === "json" ? JSON.parse(value) : value;
        }),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        getWithMetadata: vi.fn(),
      } as unknown as KVNamespace,
      RATE_LIMITS: {
        get: vi.fn(async (key: string) => mockRateLimitsKV.get(key) ?? null),
        put: vi.fn(async (key: string, value: string) => {
          mockRateLimitsKV.set(key, value);
        }),
        delete: vi.fn(),
        list: vi.fn(),
        getWithMetadata: vi.fn(),
      } as unknown as KVNamespace,
      ARTIFACTS: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        head: vi.fn(),
      } as unknown as R2Bucket,
      CLAUDE_RUNNER: {
        idFromName: vi.fn((name: string) => ({ toString: () => name })),
        get: vi.fn(() => ({
          startAndWaitForPorts: vi.fn(),
          getState: vi.fn(),
          fetch: vi.fn(),
          stop: vi.fn(),
        })),
        newUniqueId: vi.fn(),
        idFromString: vi.fn(),
        jurisdiction: vi.fn(),
      } as unknown as DurableObjectNamespace,
      ENVIRONMENT: "test",
    };
  }

  function createAuthenticatedRequest(
    path: string,
    options: RequestInit = {}
  ): Request {
    return new Request(`http://localhost${path}`, {
      ...options,
      headers: {
        Authorization: "Bearer test-api-key",
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  }

  describe("POST /v1/tasks", () => {
    it("creates a task and returns 202 Accepted", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks", {
          method: "POST",
          body: JSON.stringify(validPayload),
        }),
        env
      );

      expect(res.status).toBe(202);
      const body = (await res.json()) as TaskCreatedBody;
      expect(body).toHaveProperty("taskId");
      expect(body.status).toBe("pending");
      expect(body).toHaveProperty("createdAt");
      expect(body).toHaveProperty("statusUrl");
    });

    it("stores task in KV", async () => {
      const env = createMockEnv();
      const putSpy = vi.spyOn(env.TASKS, "put");

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks", {
          method: "POST",
          body: JSON.stringify(validPayload),
        }),
        env
      );

      expect(res.status).toBe(202);
      expect(putSpy).toHaveBeenCalled();

      const [, taskJson] = putSpy.mock.calls[0];
      const task = JSON.parse(taskJson as string);
      expect(task.status).toBe("pending");
      expect(task.prompt).toBe(validPayload.prompt);
      expect(task.repository.url).toBe(validPayload.repository.url);
    });

    it("rejects requests without authentication", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        new Request("http://localhost/v1/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validPayload),
        }),
        env
      );

      expect(res.status).toBe(401);
    });

    it("validates request body", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks", {
          method: "POST",
          body: JSON.stringify({ prompt: "" }),
        }),
        env
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.message).toBe("Validation failed");
    });

    it("rejects invalid repository URLs", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks", {
          method: "POST",
          body: JSON.stringify({
            ...validPayload,
            repository: { url: "https://malicious.com/repo" },
          }),
        }),
        env
      );

      expect(res.status).toBe(400);
    });

    it("includes rate limit headers", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks", {
          method: "POST",
          body: JSON.stringify(validPayload),
        }),
        env
      );

      expect(res.headers.get("X-RateLimit-Limit")).toBe("100");
      expect(res.headers.get("X-RateLimit-Remaining")).toBeDefined();
    });
  });

  describe("GET /v1/tasks/:id", () => {
    it("returns task details", async () => {
      const env = createMockEnv();
      const task: Task = {
        id: "task_123",
        status: "pending",
        prompt: "Test prompt",
        repository: { url: "https://github.com/user/repo", branch: "main" },
        createdAt: new Date().toISOString(),
      };
      mockTasksKV.set("task_123", JSON.stringify(task));

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks/task_123"),
        env
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as TaskBody;
      expect(body.id).toBe("task_123");
      expect(body.status).toBe("pending");
    });

    it("returns 404 for non-existent task", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks/non-existent"),
        env
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.message).toBe("Task not found");
    });

    it("requires authentication", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        new Request("http://localhost/v1/tasks/task_123"),
        env
      );

      expect(res.status).toBe(401);
    });
  });

  describe("POST /v1/tasks/:id/cancel", () => {
    it("cancels a pending task", async () => {
      const env = createMockEnv();
      const task: Task = {
        id: "task_123",
        status: "pending",
        prompt: "Test prompt",
        repository: { url: "https://github.com/user/repo", branch: "main" },
        createdAt: new Date().toISOString(),
      };
      mockTasksKV.set("task_123", JSON.stringify(task));

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks/task_123/cancel", {
          method: "POST",
        }),
        env
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as CancelledBody;
      expect(body.status).toBe("cancelled");
      expect(body).toHaveProperty("cancelledAt");
    });

    it("cancels a running task", async () => {
      const env = createMockEnv();
      const task: Task = {
        id: "task_123",
        status: "running",
        prompt: "Test prompt",
        repository: { url: "https://github.com/user/repo", branch: "main" },
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
      };
      mockTasksKV.set("task_123", JSON.stringify(task));

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks/task_123/cancel", {
          method: "POST",
        }),
        env
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as CancelledBody;
      expect(body.status).toBe("cancelled");
    });

    it("rejects cancellation of completed task", async () => {
      const env = createMockEnv();
      const task: Task = {
        id: "task_123",
        status: "completed",
        prompt: "Test prompt",
        repository: { url: "https://github.com/user/repo", branch: "main" },
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      mockTasksKV.set("task_123", JSON.stringify(task));

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks/task_123/cancel", {
          method: "POST",
        }),
        env
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.message).toBe("Task cannot be cancelled");
    });

    it("returns 404 for non-existent task", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks/non-existent/cancel", {
          method: "POST",
        }),
        env
      );

      expect(res.status).toBe(404);
    });

    it("updates task status in KV", async () => {
      const env = createMockEnv();
      const task: Task = {
        id: "task_123",
        status: "pending",
        prompt: "Test prompt",
        repository: { url: "https://github.com/user/repo", branch: "main" },
        createdAt: new Date().toISOString(),
      };
      mockTasksKV.set("task_123", JSON.stringify(task));
      const putSpy = vi.spyOn(env.TASKS, "put");

      await app.fetch(
        createAuthenticatedRequest("/v1/tasks/task_123/cancel", {
          method: "POST",
        }),
        env
      );

      expect(putSpy).toHaveBeenCalled();
      const [, updatedTaskJson] = putSpy.mock.calls[0];
      const updatedTask = JSON.parse(updatedTaskJson as string);
      expect(updatedTask.status).toBe("cancelled");
      expect(updatedTask.completedAt).toBeDefined();
    });
  });

  describe("GET /v1/tasks/:id/logs", () => {
    it("returns 404 for non-existent task", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks/non-existent/logs"),
        env
      );

      expect(res.status).toBe(404);
    });

    it("returns 404 when logs not found in storage", async () => {
      const env = createMockEnv();
      const task: Task = {
        id: "task_123",
        status: "completed",
        prompt: "Test prompt",
        repository: { url: "https://github.com/user/repo", branch: "main" },
        createdAt: new Date().toISOString(),
      };
      mockTasksKV.set("task_123", JSON.stringify(task));

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks/task_123/logs"),
        env
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.message).toBe("Logs not found");
    });
  });

  describe("GET /v1/tasks/:id/diff", () => {
    it("returns 404 for non-existent task", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks/non-existent/diff"),
        env
      );

      expect(res.status).toBe(404);
    });

    it("returns 404 when diff not found in storage", async () => {
      const env = createMockEnv();
      const task: Task = {
        id: "task_123",
        status: "completed",
        prompt: "Test prompt",
        repository: { url: "https://github.com/user/repo", branch: "main" },
        createdAt: new Date().toISOString(),
      };
      mockTasksKV.set("task_123", JSON.stringify(task));

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks/task_123/diff"),
        env
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.message).toBe("Diff not found");
    });
  });

  describe("Public endpoints", () => {
    it("GET /health returns ok without auth", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        new Request("http://localhost/health"),
        env
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as HealthBody;
      expect(body.status).toBe("ok");
      expect(body).toHaveProperty("timestamp");
      expect(body).toHaveProperty("version");
    });

    it("GET / returns service info without auth", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        new Request("http://localhost/"),
        env
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as ServiceInfoBody;
      expect(body.name).toBe("Helios");
    });
  });

  describe("Queue Integration", () => {
    function createMockEnvWithQueue(): Env & {
      TASK_QUEUE: { send: ReturnType<typeof vi.fn> };
    } {
      return {
        ...createMockEnv(),
        TASK_QUEUE: {
          send: vi.fn().mockResolvedValue(undefined),
        },
      } as unknown as Env & { TASK_QUEUE: { send: ReturnType<typeof vi.fn> } };
    }

    it("queues task when output.mode is async and queue is available", async () => {
      const env = createMockEnvWithQueue();
      const asyncPayload = {
        ...validPayload,
        output: { mode: "async" },
      };

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks", {
          method: "POST",
          body: JSON.stringify(asyncPayload),
        }),
        env
      );

      expect(res.status).toBe(202);
      expect(env.TASK_QUEUE.send).toHaveBeenCalledTimes(1);

      const queueMessage = env.TASK_QUEUE.send.mock.calls[0][0];
      expect(queueMessage).toHaveProperty("taskId");
      expect(queueMessage.prompt).toBe(validPayload.prompt);
      expect(queueMessage.repository.url).toBe(validPayload.repository.url);
      expect(queueMessage.claude.apiKey).toBe(validPayload.claude.apiKey);
      expect(queueMessage.claude.model).toBe(validPayload.claude.model);
    });

    it("does NOT queue task when output.mode is sync", async () => {
      const env = createMockEnvWithQueue();
      const syncPayload = {
        ...validPayload,
        output: { mode: "sync" },
      };

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks", {
          method: "POST",
          body: JSON.stringify(syncPayload),
        }),
        env
      );

      expect(res.status).toBe(202);
      expect(env.TASK_QUEUE.send).not.toHaveBeenCalled();
    });

    it("does NOT queue task when queue is not available", async () => {
      const env = createMockEnv(); // No TASK_QUEUE
      const asyncPayload = {
        ...validPayload,
        output: { mode: "async" },
      };

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks", {
          method: "POST",
          body: JSON.stringify(asyncPayload),
        }),
        env
      );

      expect(res.status).toBe(202);
      // No error thrown, just no queueing
    });

    it("includes webhook info in queue message when provided", async () => {
      const env = createMockEnvWithQueue();
      const payloadWithWebhook = {
        ...validPayload,
        output: {
          mode: "async",
          webhook: {
            url: "https://example.com/webhook",
            secret: "super-secret-key-123",
          },
        },
      };

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks", {
          method: "POST",
          body: JSON.stringify(payloadWithWebhook),
        }),
        env
      );

      expect(res.status).toBe(202);
      const queueMessage = env.TASK_QUEUE.send.mock.calls[0][0];
      expect(queueMessage.webhook).toEqual({
        url: "https://example.com/webhook",
        secret: "super-secret-key-123",
      });
    });

    it("includes git credentials in queue message when provided", async () => {
      const env = createMockEnvWithQueue();
      const payloadWithCredentials = {
        ...validPayload,
        repository: {
          ...validPayload.repository,
          credentials: {
            type: "token",
            value: "ghp_test_token_123",
          },
        },
        output: { mode: "async" },
      };

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks", {
          method: "POST",
          body: JSON.stringify(payloadWithCredentials),
        }),
        env
      );

      expect(res.status).toBe(202);
      const queueMessage = env.TASK_QUEUE.send.mock.calls[0][0];
      expect(queueMessage.gitToken).toBe("ghp_test_token_123");
    });

    it("includes options in queue message with defaults", async () => {
      const env = createMockEnvWithQueue();
      const asyncPayload = {
        ...validPayload,
        output: { mode: "async" },
      };

      await app.fetch(
        createAuthenticatedRequest("/v1/tasks", {
          method: "POST",
          body: JSON.stringify(asyncPayload),
        }),
        env
      );

      const queueMessage = env.TASK_QUEUE.send.mock.calls[0][0];
      expect(queueMessage.options.timeout).toBe(300);
      expect(queueMessage.options.allowedTools).toEqual([
        "Read",
        "Write",
        "Bash",
        "Glob",
        "Grep",
      ]);
      expect(queueMessage.options.workingDirectory).toBe("/workspace");
    });

    it("includes custom options in queue message when provided", async () => {
      const env = createMockEnvWithQueue();
      const payloadWithOptions = {
        ...validPayload,
        options: {
          timeout: 600,
          allowedTools: ["Read", "Write"],
          workingDirectory: "/custom/dir",
          environment: { NODE_ENV: "test" },
        },
        output: { mode: "async" },
      };

      await app.fetch(
        createAuthenticatedRequest("/v1/tasks", {
          method: "POST",
          body: JSON.stringify(payloadWithOptions),
        }),
        env
      );

      const queueMessage = env.TASK_QUEUE.send.mock.calls[0][0];
      expect(queueMessage.options.timeout).toBe(600);
      expect(queueMessage.options.allowedTools).toEqual(["Read", "Write"]);
      expect(queueMessage.options.workingDirectory).toBe("/custom/dir");
      expect(queueMessage.options.environment).toEqual({ NODE_ENV: "test" });
    });
  });
});
