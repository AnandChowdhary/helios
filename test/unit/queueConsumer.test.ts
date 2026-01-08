import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env, Task, TaskQueueMessage } from "../../src/types";
import { handleQueue } from "../../src/queue/consumer";

describe("Queue Consumer", () => {
  let mockTasksKV: Map<string, string>;

  beforeEach(() => {
    mockTasksKV = new Map();
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
      ENVIRONMENT: "test",
    };
  }

  function createMockMessage(
    body: TaskQueueMessage
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
    messages: Message<TaskQueueMessage>[]
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

  it("processes a queued task and updates status to running", async () => {
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

    // Check task was updated to running
    const updatedTask = JSON.parse(mockTasksKV.get("task_123")!);
    expect(updatedTask.status).toBe("running");
    expect(updatedTask.startedAt).toBeDefined();

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

    const message1 = createMockMessage({ ...sampleQueueMessage, taskId: "task_1" });
    const message2 = createMockMessage({ ...sampleQueueMessage, taskId: "task_2" });
    const batch = createMockBatch([message1, message2]);

    await handleQueue(batch, env);

    expect(message1.ack).toHaveBeenCalled();
    expect(message2.ack).toHaveBeenCalled();

    const updatedTask1 = JSON.parse(mockTasksKV.get("task_1")!);
    const updatedTask2 = JSON.parse(mockTasksKV.get("task_2")!);
    expect(updatedTask1.status).toBe("running");
    expect(updatedTask2.status).toBe("running");
  });
});
