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

interface PushSuccessBody {
  taskId: string;
  success: true;
  branch: string;
  message: string;
  pullRequest?: {
    number: number;
    url: string;
    title: string;
  };
  pullRequestError?: string;
}

interface PushErrorBody {
  taskId: string;
  success: false;
  error: string;
}

interface TaskListBody {
  tasks: TaskBody[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
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
  let mockUsageKV: Map<string, string>;
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
    concurrentTaskLimit: 5,
    enabled: true,
  };

  beforeEach(async () => {
    mockTasksKV = new Map();
    mockApiKeysKV = new Map();
    mockRateLimitsKV = new Map();
    mockUsageKV = new Map();

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
      USAGE: {
        get: vi.fn(async (key: string, format?: string) => {
          const value = mockUsageKV.get(key);
          if (!value) return null;
          return format === "json" ? JSON.parse(value) : value;
        }),
        put: vi.fn(async (key: string, value: string) => {
          mockUsageKV.set(key, value);
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
    options: RequestInit = {},
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
    it("creates async task and returns 202 Accepted", async () => {
      const env = createMockEnv();
      const asyncPayload = { ...validPayload, output: { mode: "async" } };
      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks", {
          method: "POST",
          body: JSON.stringify(asyncPayload),
        }),
        env,
      );

      expect(res.status).toBe(202);
      const body = (await res.json()) as TaskCreatedBody;
      expect(body).toHaveProperty("taskId");
      expect(body.status).toBe("pending");
      expect(body).toHaveProperty("createdAt");
      expect(body).toHaveProperty("statusUrl");
    });

    it("creates sync task and returns 200 with SSE stream", async () => {
      const env = createMockEnv();
      const syncPayload = { ...validPayload, output: { mode: "sync" } };
      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks", {
          method: "POST",
          body: JSON.stringify(syncPayload),
        }),
        env,
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
    });

    it("stores task in KV", async () => {
      const env = createMockEnv();
      const putSpy = vi.spyOn(env.TASKS, "put");
      const asyncPayload = { ...validPayload, output: { mode: "async" } };

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks", {
          method: "POST",
          body: JSON.stringify(asyncPayload),
        }),
        env,
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
        env,
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
        env,
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
        env,
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
        env,
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
        env,
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
        env,
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.message).toBe("Task not found");
    });

    it("requires authentication", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        new Request("http://localhost/v1/tasks/task_123"),
        env,
      );

      expect(res.status).toBe(401);
    });
  });

  describe("GET /v1/tasks (list tasks)", () => {
    it("returns empty list when no tasks exist", async () => {
      const env = createMockEnv();
      const res = await app.fetch(createAuthenticatedRequest("/v1/tasks"), env);

      expect(res.status).toBe(200);
      const body = (await res.json()) as TaskListBody;
      expect(body.tasks).toEqual([]);
      expect(body.pagination.total).toBe(0);
      expect(body.pagination.hasMore).toBe(false);
    });

    it("returns tasks for the authenticated API key", async () => {
      const env = createMockEnv();

      // Create tasks and add them to the index
      const task1: Task = {
        id: "task_1",
        status: "completed",
        prompt: "Test prompt 1",
        repository: { url: "https://github.com/user/repo", branch: "main" },
        createdAt: new Date(Date.now() - 2000).toISOString(),
        apiKeyId: testApiKey.id,
      };
      const task2: Task = {
        id: "task_2",
        status: "pending",
        prompt: "Test prompt 2",
        repository: { url: "https://github.com/user/repo", branch: "main" },
        createdAt: new Date(Date.now() - 1000).toISOString(),
        apiKeyId: testApiKey.id,
      };
      mockTasksKV.set("task_1", JSON.stringify(task1));
      mockTasksKV.set("task_2", JSON.stringify(task2));

      // Set up the task index (newest first)
      const index = {
        apiKeyId: testApiKey.id,
        taskIds: ["task_2", "task_1"],
        updatedAt: new Date().toISOString(),
      };
      mockTasksKV.set(`index:${testApiKey.id}`, JSON.stringify(index));

      const res = await app.fetch(createAuthenticatedRequest("/v1/tasks"), env);

      expect(res.status).toBe(200);
      const body = (await res.json()) as TaskListBody;
      expect(body.tasks).toHaveLength(2);
      expect(body.tasks[0].id).toBe("task_2"); // newest first
      expect(body.tasks[1].id).toBe("task_1");
      expect(body.pagination.total).toBe(2);
      expect(body.pagination.hasMore).toBe(false);
    });

    it("supports pagination with limit and offset", async () => {
      const env = createMockEnv();

      // Create 5 tasks
      const taskIds: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const task: Task = {
          id: `task_${i}`,
          status: "completed",
          prompt: `Test prompt ${i}`,
          repository: { url: "https://github.com/user/repo", branch: "main" },
          createdAt: new Date(Date.now() - i * 1000).toISOString(),
          apiKeyId: testApiKey.id,
        };
        mockTasksKV.set(`task_${i}`, JSON.stringify(task));
        taskIds.push(`task_${i}`);
      }

      // Set up the task index
      const index = {
        apiKeyId: testApiKey.id,
        taskIds: taskIds,
        updatedAt: new Date().toISOString(),
      };
      mockTasksKV.set(`index:${testApiKey.id}`, JSON.stringify(index));

      // Test limit
      const res1 = await app.fetch(
        createAuthenticatedRequest("/v1/tasks?limit=2"),
        env,
      );
      expect(res1.status).toBe(200);
      const body1 = (await res1.json()) as TaskListBody;
      expect(body1.tasks).toHaveLength(2);
      expect(body1.pagination.limit).toBe(2);
      expect(body1.pagination.hasMore).toBe(true);

      // Test offset
      const res2 = await app.fetch(
        createAuthenticatedRequest("/v1/tasks?limit=2&offset=2"),
        env,
      );
      expect(res2.status).toBe(200);
      const body2 = (await res2.json()) as TaskListBody;
      expect(body2.tasks).toHaveLength(2);
      expect(body2.tasks[0].id).toBe("task_3");
      expect(body2.pagination.offset).toBe(2);
      expect(body2.pagination.hasMore).toBe(true);

      // Test last page
      const res3 = await app.fetch(
        createAuthenticatedRequest("/v1/tasks?limit=2&offset=4"),
        env,
      );
      expect(res3.status).toBe(200);
      const body3 = (await res3.json()) as TaskListBody;
      expect(body3.tasks).toHaveLength(1);
      expect(body3.pagination.hasMore).toBe(false);
    });

    it("supports filtering by status", async () => {
      const env = createMockEnv();

      // Create tasks with different statuses
      const task1: Task = {
        id: "task_1",
        status: "completed",
        prompt: "Test prompt 1",
        repository: { url: "https://github.com/user/repo", branch: "main" },
        createdAt: new Date().toISOString(),
        apiKeyId: testApiKey.id,
      };
      const task2: Task = {
        id: "task_2",
        status: "pending",
        prompt: "Test prompt 2",
        repository: { url: "https://github.com/user/repo", branch: "main" },
        createdAt: new Date().toISOString(),
        apiKeyId: testApiKey.id,
      };
      const task3: Task = {
        id: "task_3",
        status: "completed",
        prompt: "Test prompt 3",
        repository: { url: "https://github.com/user/repo", branch: "main" },
        createdAt: new Date().toISOString(),
        apiKeyId: testApiKey.id,
      };
      mockTasksKV.set("task_1", JSON.stringify(task1));
      mockTasksKV.set("task_2", JSON.stringify(task2));
      mockTasksKV.set("task_3", JSON.stringify(task3));

      const index = {
        apiKeyId: testApiKey.id,
        taskIds: ["task_3", "task_2", "task_1"],
        updatedAt: new Date().toISOString(),
      };
      mockTasksKV.set(`index:${testApiKey.id}`, JSON.stringify(index));

      // Filter by completed status
      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks?status=completed"),
        env,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as TaskListBody;
      expect(body.tasks).toHaveLength(2);
      expect(body.tasks.every((t) => t.status === "completed")).toBe(true);
      expect(body.pagination.total).toBe(2);
    });

    it("returns 400 for invalid status filter", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks?status=invalid"),
        env,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.message).toContain("Invalid status filter");
    });

    it("returns 400 for invalid limit", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks?limit=0"),
        env,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.message).toContain(
        "limit must be a number between 1 and 100",
      );
    });

    it("returns 400 for limit exceeding maximum", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks?limit=101"),
        env,
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 for negative offset", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks?offset=-1"),
        env,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.message).toContain(
        "offset must be a non-negative number",
      );
    });

    it("requires authentication", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        new Request("http://localhost/v1/tasks"),
        env,
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
        env,
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
        env,
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
        env,
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
        env,
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
        env,
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
        env,
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
        env,
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
        env,
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
        env,
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.message).toBe("Diff not found");
    });
  });

  describe("POST /v1/tasks/:id/push", () => {
    const validPushPayload = {
      branch: "helios/fix-auth-tests",
      credentials: {
        type: "token",
        value: "ghp_test_token_123",
      },
      createPR: false,
    };

    it("returns 404 for non-existent task", async () => {
      const env = createMockEnv();
      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks/non-existent/push", {
          method: "POST",
          body: JSON.stringify(validPushPayload),
        }),
        env,
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.message).toBe("Task not found");
    });

    it("rejects push for pending task", async () => {
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
        createAuthenticatedRequest("/v1/tasks/task_123/push", {
          method: "POST",
          body: JSON.stringify(validPushPayload),
        }),
        env,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.message).toContain(
        "Cannot push changes for task with status: pending",
      );
    });

    it("rejects push for running task", async () => {
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
        createAuthenticatedRequest("/v1/tasks/task_123/push", {
          method: "POST",
          body: JSON.stringify(validPushPayload),
        }),
        env,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.message).toContain(
        "Cannot push changes for task with status: running",
      );
    });

    it("rejects push for failed task", async () => {
      const env = createMockEnv();
      const task: Task = {
        id: "task_123",
        status: "failed",
        prompt: "Test prompt",
        repository: { url: "https://github.com/user/repo", branch: "main" },
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        error: "Something went wrong",
      };
      mockTasksKV.set("task_123", JSON.stringify(task));

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks/task_123/push", {
          method: "POST",
          body: JSON.stringify(validPushPayload),
        }),
        env,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.message).toContain(
        "Cannot push changes for task with status: failed",
      );
    });

    it("allows push for completed task", async () => {
      const env = createMockEnv();
      const task: Task = {
        id: "task_123",
        status: "completed",
        prompt: "Test prompt",
        repository: { url: "https://github.com/user/repo", branch: "main" },
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        result: {
          success: true,
          summary: "Task completed",
          filesChanged: [],
          usage: { inputTokens: 100, outputTokens: 50 },
        },
      };
      mockTasksKV.set("task_123", JSON.stringify(task));

      // Mock the container fetch to return a successful push result
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            branch: "helios/fix-auth-tests",
            pushed: true,
            message: "Successfully pushed to branch: helios/fix-auth-tests",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      env.CLAUDE_RUNNER = {
        idFromName: vi.fn((name: string) => ({ toString: () => name })),
        get: vi.fn(() => ({
          startAndWaitForPorts: vi.fn(),
          getState: vi.fn(),
          fetch: mockFetch,
          stop: vi.fn(),
        })),
        newUniqueId: vi.fn(),
        idFromString: vi.fn(),
        jurisdiction: vi.fn(),
      } as unknown as DurableObjectNamespace;

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks/task_123/push", {
          method: "POST",
          body: JSON.stringify(validPushPayload),
        }),
        env,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as PushSuccessBody;
      expect(body.success).toBe(true);
      expect(body.branch).toBe("helios/fix-auth-tests");
      expect(body.taskId).toBe("task_123");
    });

    it("validates branch name", async () => {
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

      const invalidPayload = {
        ...validPushPayload,
        branch: "invalid branch with spaces!",
      };

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks/task_123/push", {
          method: "POST",
          body: JSON.stringify(invalidPayload),
        }),
        env,
      );

      expect(res.status).toBe(400);
    });

    it("requires credentials", async () => {
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

      const payloadWithoutCredentials = {
        branch: "helios/fix-auth-tests",
      };

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks/task_123/push", {
          method: "POST",
          body: JSON.stringify(payloadWithoutCredentials),
        }),
        env,
      );

      expect(res.status).toBe(400);
    });

    it("returns error when container push fails", async () => {
      const env = createMockEnv();
      const task: Task = {
        id: "task_123",
        status: "completed",
        prompt: "Test prompt",
        repository: { url: "https://github.com/user/repo", branch: "main" },
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        result: {
          success: true,
          summary: "Task completed",
          filesChanged: [],
          usage: { inputTokens: 100, outputTokens: 50 },
        },
      };
      mockTasksKV.set("task_123", JSON.stringify(task));

      // Mock the container fetch to return an error
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "Failed to push: authentication failed",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        ),
      );
      env.CLAUDE_RUNNER = {
        idFromName: vi.fn((name: string) => ({ toString: () => name })),
        get: vi.fn(() => ({
          startAndWaitForPorts: vi.fn(),
          getState: vi.fn(),
          fetch: mockFetch,
          stop: vi.fn(),
        })),
        newUniqueId: vi.fn(),
        idFromString: vi.fn(),
        jurisdiction: vi.fn(),
      } as unknown as DurableObjectNamespace;

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks/task_123/push", {
          method: "POST",
          body: JSON.stringify(validPushPayload),
        }),
        env,
      );

      expect(res.status).toBe(500);
      const body = (await res.json()) as PushErrorBody;
      expect(body.success).toBe(false);
      expect(body.error).toContain("Failed to push");
    });

    it("includes PR options in request to container", async () => {
      const env = createMockEnv();
      const task: Task = {
        id: "task_123",
        status: "completed",
        prompt: "Test prompt",
        repository: { url: "https://github.com/user/repo", branch: "main" },
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        result: {
          success: true,
          summary: "Task completed",
          filesChanged: [],
          usage: { inputTokens: 100, outputTokens: 50 },
        },
      };
      mockTasksKV.set("task_123", JSON.stringify(task));

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            branch: "helios/fix-auth-tests",
            pushed: true,
            message: "Successfully pushed",
            pullRequest: {
              number: 42,
              url: "https://github.com/user/repo/pull/42",
              title: "Fix auth tests",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      env.CLAUDE_RUNNER = {
        idFromName: vi.fn((name: string) => ({ toString: () => name })),
        get: vi.fn(() => ({
          startAndWaitForPorts: vi.fn(),
          getState: vi.fn(),
          fetch: mockFetch,
          stop: vi.fn(),
        })),
        newUniqueId: vi.fn(),
        idFromString: vi.fn(),
        jurisdiction: vi.fn(),
      } as unknown as DurableObjectNamespace;

      const pushPayloadWithPR = {
        branch: "helios/fix-auth-tests",
        credentials: {
          type: "token",
          value: "ghp_test_token_123",
        },
        createPR: true,
        prTitle: "Fix auth tests",
        prBody: "This PR fixes the auth tests",
      };

      const res = await app.fetch(
        createAuthenticatedRequest("/v1/tasks/task_123/push", {
          method: "POST",
          body: JSON.stringify(pushPayloadWithPR),
        }),
        env,
      );

      expect(res.status).toBe(200);

      // Verify the fetch was called with correct body
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchCall = mockFetch.mock.calls[0][0] as Request;
      const fetchBody = JSON.parse(await fetchCall.text());
      expect(fetchBody.createPR).toBe(true);
      expect(fetchBody.prTitle).toBe("Fix auth tests");
      expect(fetchBody.prBody).toBe("This PR fixes the auth tests");

      const body = (await res.json()) as PushSuccessBody;
      expect(body.pullRequest).toBeDefined();
      expect(body.pullRequest?.number).toBe(42);
      expect(body.pullRequest?.url).toBe(
        "https://github.com/user/repo/pull/42",
      );
    });
  });

  describe("Public endpoints", () => {
    it("GET /health returns ok without auth", async () => {
      const env = createMockEnv();
      const res = await app.fetch(new Request("http://localhost/health"), env);

      expect(res.status).toBe(200);
      const body = (await res.json()) as HealthBody;
      expect(body.status).toBe("ok");
      expect(body).toHaveProperty("timestamp");
      expect(body).toHaveProperty("version");
    });

    it("GET / returns service info without auth", async () => {
      const env = createMockEnv();
      const res = await app.fetch(new Request("http://localhost/"), env);

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
        env,
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

    it("does NOT queue task when output.mode is sync (returns SSE stream)", async () => {
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
        env,
      );

      // Sync mode returns 200 with SSE stream, not 202
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
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
        env,
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
        env,
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
        env,
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
        env,
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
        env,
      );

      const queueMessage = env.TASK_QUEUE.send.mock.calls[0][0];
      expect(queueMessage.options.timeout).toBe(600);
      expect(queueMessage.options.allowedTools).toEqual(["Read", "Write"]);
      expect(queueMessage.options.workingDirectory).toBe("/custom/dir");
      expect(queueMessage.options.environment).toEqual({ NODE_ENV: "test" });
    });
  });
});
