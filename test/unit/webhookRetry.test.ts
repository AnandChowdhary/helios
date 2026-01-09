import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Env, Task, TaskQueueMessage } from "../../src/types";
import { handleQueue } from "../../src/queue/consumer";

// Mock the container runner module
vi.mock("../../src/container/runner", () => ({
  startContainerTask: vi.fn().mockResolvedValue(undefined),
  getContainerState: vi
    .fn()
    .mockResolvedValue({ status: "stopped_with_code", exitCode: 0 }),
  getContainerResult: vi.fn().mockResolvedValue({
    success: true,
    summary: "Task completed successfully",
    filesChanged: [],
    usage: { inputTokens: 100, outputTokens: 50 },
  }),
  getContainerLogs: vi.fn().mockResolvedValue("[mock] Task logs"),
}));

// Mock the concurrent task limit module
vi.mock("../../src/middleware/concurrentTaskLimit", () => ({
  decrementActiveTaskCount: vi.fn().mockResolvedValue(0),
}));

describe("Webhook Retry Mechanism", () => {
  let mockTasksKV: Map<string, string>;
  let mockUsageKV: Map<string, string>;
  let mockR2: Map<string, string>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTasksKV = new Map();
    mockUsageKV = new Map();
    mockR2 = new Map();

    // Create a mock fetch that we can control
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    // Restore original fetch
    vi.unstubAllGlobals();
    vi.useRealTimers();
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
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        getWithMetadata: vi.fn(),
      } as unknown as KVNamespace,
      RATE_LIMITS: {
        get: vi.fn(),
        put: vi.fn(),
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
        put: vi.fn(async (key: string, value: string) => {
          mockR2.set(key, value);
        }),
        get: vi.fn(async (key: string) => {
          const value = mockR2.get(key);
          if (!value) return null;
          return { text: async () => value, body: value };
        }),
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

  function createMockMessage(
    body: TaskQueueMessage,
  ): Message<TaskQueueMessage> {
    return {
      body,
      id: "msg-123",
      timestamp: new Date(),
      attempts: 1,
      ack: vi.fn(),
      retry: vi.fn(),
    };
  }

  function createMockBatch(
    messages: Message<TaskQueueMessage>[],
  ): MessageBatch<TaskQueueMessage> {
    return {
      messages,
      queue: "helios-tasks",
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    };
  }

  const sampleQueueMessage: TaskQueueMessage = {
    taskId: "task_123",
    apiKeyId: "key_test",
    prompt: "Fix the bug",
    repository: {
      url: "https://github.com/user/repo",
      branch: "main",
    },
    claude: {
      apiKey: "sk-ant-api03-test",
      model: "claude-sonnet-4-5",
      maxTurns: 10,
    },
    options: {
      timeout: 300,
      allowedTools: ["Read", "Write", "Bash", "Glob", "Grep"],
      workingDirectory: "/workspace",
    },
    webhook: {
      url: "https://example.com/webhook",
      secret: "webhook-secret-1234567890",
    },
  };

  it("delivers webhook successfully on first attempt", async () => {
    const env = createMockEnv();
    const task: Task = {
      id: "task_123",
      status: "pending",
      prompt: "Fix the bug",
      repository: { url: "https://github.com/user/repo", branch: "main" },
      createdAt: new Date().toISOString(),
    };
    mockTasksKV.set("task_123", JSON.stringify(task));

    // Mock successful webhook delivery
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const message = createMockMessage(sampleQueueMessage);
    const batch = createMockBatch([message]);

    await handleQueue(batch, env);

    // Webhook should be called exactly once (no retries needed)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/webhook",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Helios-Event": "task.completed",
        }),
      }),
    );
  });

  it("retries webhook on 500 server error and succeeds", async () => {
    const env = createMockEnv();
    const task: Task = {
      id: "task_123",
      status: "pending",
      prompt: "Fix the bug",
      repository: { url: "https://github.com/user/repo", branch: "main" },
      createdAt: new Date().toISOString(),
    };
    mockTasksKV.set("task_123", JSON.stringify(task));

    // First attempt fails with 500, second succeeds
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const message = createMockMessage(sampleQueueMessage);
    const batch = createMockBatch([message]);

    const handlePromise = handleQueue(batch, env);

    // Advance timer for retry delay
    await vi.advanceTimersByTimeAsync(2000);

    await handlePromise;

    // Should have been called twice (initial + 1 retry)
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries webhook on 429 rate limit and succeeds", async () => {
    const env = createMockEnv();
    const task: Task = {
      id: "task_123",
      status: "pending",
      prompt: "Fix the bug",
      repository: { url: "https://github.com/user/repo", branch: "main" },
      createdAt: new Date().toISOString(),
    };
    mockTasksKV.set("task_123", JSON.stringify(task));

    // First attempt fails with 429, second succeeds
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const message = createMockMessage(sampleQueueMessage);
    const batch = createMockBatch([message]);

    const handlePromise = handleQueue(batch, env);

    await vi.advanceTimersByTimeAsync(2000);

    await handlePromise;

    // Should have been called twice (initial + 1 retry)
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry webhook on 400 client error", async () => {
    const env = createMockEnv();
    const task: Task = {
      id: "task_123",
      status: "pending",
      prompt: "Fix the bug",
      repository: { url: "https://github.com/user/repo", branch: "main" },
      createdAt: new Date().toISOString(),
    };
    mockTasksKV.set("task_123", JSON.stringify(task));

    // Fail with 400 - should not retry
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400 });

    const message = createMockMessage(sampleQueueMessage);
    const batch = createMockBatch([message]);

    await handleQueue(batch, env);

    // Should only be called once (no retry for 4xx except 429)
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry webhook on 404 not found", async () => {
    const env = createMockEnv();
    const task: Task = {
      id: "task_123",
      status: "pending",
      prompt: "Fix the bug",
      repository: { url: "https://github.com/user/repo", branch: "main" },
      createdAt: new Date().toISOString(),
    };
    mockTasksKV.set("task_123", JSON.stringify(task));

    // Fail with 404 - should not retry
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });

    const message = createMockMessage(sampleQueueMessage);
    const batch = createMockBatch([message]);

    await handleQueue(batch, env);

    // Should only be called once
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries webhook on network error and succeeds", async () => {
    const env = createMockEnv();
    const task: Task = {
      id: "task_123",
      status: "pending",
      prompt: "Fix the bug",
      repository: { url: "https://github.com/user/repo", branch: "main" },
      createdAt: new Date().toISOString(),
    };
    mockTasksKV.set("task_123", JSON.stringify(task));

    // First attempt throws network error, second succeeds
    fetchMock
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const message = createMockMessage(sampleQueueMessage);
    const batch = createMockBatch([message]);

    const handlePromise = handleQueue(batch, env);

    await vi.advanceTimersByTimeAsync(2000);

    await handlePromise;

    // Should have been called twice (initial + 1 retry)
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("exhausts all retries on persistent failure", async () => {
    const env = createMockEnv();
    const task: Task = {
      id: "task_123",
      status: "pending",
      prompt: "Fix the bug",
      repository: { url: "https://github.com/user/repo", branch: "main" },
      createdAt: new Date().toISOString(),
    };
    mockTasksKV.set("task_123", JSON.stringify(task));

    // All attempts fail with 500
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const message = createMockMessage(sampleQueueMessage);
    const batch = createMockBatch([message]);

    const handlePromise = handleQueue(batch, env);

    // Advance through all retry delays (1s, 2s, 4s) in stages
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }

    await handlePromise;

    // Should be called 4 times (initial + 3 retries)
    expect(fetchMock).toHaveBeenCalledTimes(4);
  }, 30000);

  it("includes correct webhook headers and signature", async () => {
    const env = createMockEnv();
    const task: Task = {
      id: "task_123",
      status: "pending",
      prompt: "Fix the bug",
      repository: { url: "https://github.com/user/repo", branch: "main" },
      createdAt: new Date().toISOString(),
    };
    mockTasksKV.set("task_123", JSON.stringify(task));

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const message = createMockMessage(sampleQueueMessage);
    const batch = createMockBatch([message]);

    await handleQueue(batch, env);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/webhook",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Helios-Event": "task.completed",
        }),
        body: expect.any(String),
      }),
    );

    // Verify the headers include the signature
    const callArgs = fetchMock.mock.calls[0];
    const headers = callArgs[1].headers;
    expect(headers["X-Helios-Signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it("sends webhook payload with task result", async () => {
    const env = createMockEnv();
    const task: Task = {
      id: "task_123",
      status: "pending",
      prompt: "Fix the bug",
      repository: { url: "https://github.com/user/repo", branch: "main" },
      createdAt: new Date().toISOString(),
    };
    mockTasksKV.set("task_123", JSON.stringify(task));

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const message = createMockMessage(sampleQueueMessage);
    const batch = createMockBatch([message]);

    await handleQueue(batch, env);

    const callArgs = fetchMock.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body.event).toBe("task.completed");
    expect(body.taskId).toBe("task_123");
    expect(body.status).toBe("completed");
    expect(body.result).toBeDefined();
    expect(body.completedAt).toBeDefined();
  });

  it("task completion is not blocked by webhook failure", async () => {
    const env = createMockEnv();
    const task: Task = {
      id: "task_123",
      status: "pending",
      prompt: "Fix the bug",
      repository: { url: "https://github.com/user/repo", branch: "main" },
      createdAt: new Date().toISOString(),
    };
    mockTasksKV.set("task_123", JSON.stringify(task));

    // Webhook delivery fails completely
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const message = createMockMessage(sampleQueueMessage);
    const batch = createMockBatch([message]);

    const handlePromise = handleQueue(batch, env);

    // Advance through all retry delays (1s, 2s, 4s) in stages
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }

    await handlePromise;

    // Task should still be marked as completed despite webhook failure
    const updatedTask = JSON.parse(mockTasksKV.get("task_123")!);
    expect(updatedTask.status).toBe("completed");
    expect(updatedTask.result).toBeDefined();
    expect(message.ack).toHaveBeenCalled();
  }, 30000);
});
