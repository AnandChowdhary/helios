import { describe, it, expect, vi, beforeEach } from "vitest";
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
}));

describe("Queue Consumer", () => {
  let mockTasksKV: Map<string, string>;
  let mockR2: Map<string, string>;

  beforeEach(() => {
    mockTasksKV = new Map();
    mockR2 = new Map();
    vi.clearAllMocks();
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
  };

  it("processes a queued task and completes successfully", async () => {
    const env = createMockEnv();
    const task: Task = {
      id: "task_123",
      status: "pending",
      prompt: "Fix the bug",
      repository: { url: "https://github.com/user/repo", branch: "main" },
      createdAt: new Date().toISOString(),
    };
    mockTasksKV.set("task_123", JSON.stringify(task));

    const message = createMockMessage(sampleQueueMessage);
    const batch = createMockBatch([message]);

    await handleQueue(batch, env);

    // Check task was completed
    const updatedTask = JSON.parse(mockTasksKV.get("task_123")!);
    expect(updatedTask.status).toBe("completed");
    expect(updatedTask.startedAt).toBeDefined();
    expect(updatedTask.completedAt).toBeDefined();
    expect(updatedTask.result).toBeDefined();
    expect(updatedTask.result.success).toBe(true);

    // Message should be acknowledged
    expect(message.ack).toHaveBeenCalled();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it("acknowledges message even when task not found", async () => {
    const env = createMockEnv();
    // No task in KV

    const message = createMockMessage(sampleQueueMessage);
    const batch = createMockBatch([message]);

    await handleQueue(batch, env);

    // Message should be acknowledged (task not found is not retriable)
    expect(message.ack).toHaveBeenCalled();
  });

  it("processes multiple messages in batch", async () => {
    const env = createMockEnv();

    const task1: Task = {
      id: "task_1",
      status: "pending",
      prompt: "Task 1",
      repository: { url: "https://github.com/user/repo", branch: "main" },
      createdAt: new Date().toISOString(),
    };
    const task2: Task = {
      id: "task_2",
      status: "pending",
      prompt: "Task 2",
      repository: { url: "https://github.com/user/repo", branch: "main" },
      createdAt: new Date().toISOString(),
    };
    mockTasksKV.set("task_1", JSON.stringify(task1));
    mockTasksKV.set("task_2", JSON.stringify(task2));

    const message1 = createMockMessage({
      ...sampleQueueMessage,
      taskId: "task_1",
    });
    const message2 = createMockMessage({
      ...sampleQueueMessage,
      taskId: "task_2",
    });
    const batch = createMockBatch([message1, message2]);

    await handleQueue(batch, env);

    expect(message1.ack).toHaveBeenCalled();
    expect(message2.ack).toHaveBeenCalled();

    const updatedTask1 = JSON.parse(mockTasksKV.get("task_1")!);
    const updatedTask2 = JSON.parse(mockTasksKV.get("task_2")!);
    expect(updatedTask1.status).toBe("completed");
    expect(updatedTask2.status).toBe("completed");
  });

  it("stores artifacts in R2 on completion", async () => {
    const env = createMockEnv();
    const task: Task = {
      id: "task_123",
      status: "pending",
      prompt: "Fix the bug",
      repository: { url: "https://github.com/user/repo", branch: "main" },
      createdAt: new Date().toISOString(),
    };
    mockTasksKV.set("task_123", JSON.stringify(task));

    const message = createMockMessage(sampleQueueMessage);
    const batch = createMockBatch([message]);

    await handleQueue(batch, env);

    // Check artifacts were stored
    expect(env.ARTIFACTS.put).toHaveBeenCalled();
  });
});
