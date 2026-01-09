import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Env } from "../../src/types";
import {
  StreamingLogManager,
  storeLogsToR2,
  formatLogEntry,
  getLogMetadata,
} from "../../src/utils/logs";

describe("StreamingLogManager", () => {
  let mockR2: Map<
    string,
    { content: string; metadata: Record<string, string> }
  >;
  let env: Env;

  beforeEach(() => {
    vi.useFakeTimers();
    mockR2 = new Map();
    env = {
      TASKS: {} as KVNamespace,
      API_KEYS: {} as KVNamespace,
      RATE_LIMITS: {} as KVNamespace,
      USAGE: {} as KVNamespace,
      ARTIFACTS: {
        put: vi.fn(
          async (
            key: string,
            value: string,
            options?: { customMetadata?: Record<string, string> },
          ) => {
            mockR2.set(key, {
              content: value,
              metadata: options?.customMetadata ?? {},
            });
          },
        ),
        get: vi.fn(async (key: string) => {
          const stored = mockR2.get(key);
          if (!stored) return null;
          return {
            text: async () => stored.content,
            body: stored.content,
            customMetadata: stored.metadata,
          };
        }),
        head: vi.fn(async (key: string) => {
          const stored = mockR2.get(key);
          if (!stored) return null;
          return { customMetadata: stored.metadata };
        }),
        delete: vi.fn(),
        list: vi.fn(),
      } as unknown as R2Bucket,
      CLAUDE_RUNNER: {} as DurableObjectNamespace,
      ENVIRONMENT: "test",
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("addLog", () => {
    it("adds log entries to buffer", async () => {
      const manager = new StreamingLogManager(env, "task_123", {
        flushIntervalMs: 10000,
        maxBufferSize: 100,
      });

      await manager.addLog("message", "Hello world");
      await manager.addLog("status", "Running");

      expect(manager.bufferedCount).toBe(2);
      expect(manager.totalCount).toBe(2);

      await manager.finalize();
    });

    it("triggers flush when buffer is full", async () => {
      const manager = new StreamingLogManager(env, "task_123", {
        flushIntervalMs: 60000,
        maxBufferSize: 3,
      });

      await manager.addLog("message", "Log 1");
      await manager.addLog("message", "Log 2");
      expect(manager.bufferedCount).toBe(2);

      // Adding 3rd log should trigger flush
      await manager.addLog("message", "Log 3");

      // Buffer should be empty after flush
      expect(manager.bufferedCount).toBe(0);
      expect(manager.totalCount).toBe(3);

      // R2 should have been written
      expect(env.ARTIFACTS.put).toHaveBeenCalled();

      await manager.finalize();
    });
  });

  describe("flush", () => {
    it("writes buffer to R2 with streaming status", async () => {
      const manager = new StreamingLogManager(env, "task_456", {
        flushIntervalMs: 60000,
        maxBufferSize: 100,
      });

      await manager.addLog("status", "Starting");
      await manager.addLog("message", "Hello");
      await manager.flush();

      expect(env.ARTIFACTS.put).toHaveBeenCalled();
      const stored = mockR2.get("task_456/logs.txt");
      expect(stored).toBeDefined();
      expect(stored?.content).toContain("[status] Starting");
      expect(stored?.content).toContain("[message] Hello");
      expect(stored?.metadata.status).toBe("streaming");

      await manager.finalize();
    });

    it("appends to existing logs", async () => {
      const manager = new StreamingLogManager(env, "task_789", {
        flushIntervalMs: 60000,
        maxBufferSize: 100,
      });

      await manager.addLog("message", "First");
      await manager.flush();

      await manager.addLog("message", "Second");
      await manager.flush();

      const stored = mockR2.get("task_789/logs.txt");
      expect(stored?.content).toContain("First");
      expect(stored?.content).toContain("Second");

      await manager.finalize();
    });

    it("does nothing if buffer is empty", async () => {
      const manager = new StreamingLogManager(env, "task_empty", {
        flushIntervalMs: 60000,
        maxBufferSize: 100,
      });

      await manager.flush();

      expect(env.ARTIFACTS.put).not.toHaveBeenCalled();

      await manager.finalize();
    });
  });

  describe("finalize", () => {
    it("flushes remaining buffer and marks as complete", async () => {
      const manager = new StreamingLogManager(env, "task_fin", {
        flushIntervalMs: 60000,
        maxBufferSize: 100,
      });

      await manager.addLog("message", "Final log");
      await manager.finalize();

      const stored = mockR2.get("task_fin/logs.txt");
      expect(stored).toBeDefined();
      expect(stored?.content).toContain("Final log");
      expect(stored?.metadata.status).toBe("complete");
    });

    it("prevents adding logs after finalization", async () => {
      const manager = new StreamingLogManager(env, "task_done", {
        flushIntervalMs: 60000,
        maxBufferSize: 100,
      });

      await manager.addLog("message", "Before");
      await manager.finalize();

      // This should be ignored
      await manager.addLog("message", "After");

      const stored = mockR2.get("task_done/logs.txt");
      expect(stored?.content).toContain("Before");
      expect(stored?.content).not.toContain("After");
    });

    it("is idempotent - can be called multiple times", async () => {
      const manager = new StreamingLogManager(env, "task_idem", {
        flushIntervalMs: 60000,
        maxBufferSize: 100,
      });

      await manager.addLog("message", "Test");
      await manager.finalize();
      await manager.finalize();
      await manager.finalize();

      // Should only have one put call for the logs
      const putCalls = (
        env.ARTIFACTS.put as ReturnType<typeof vi.fn>
      ).mock.calls.filter(
        (call: unknown[]) => call[0] === "task_idem/logs.txt",
      );
      expect(putCalls.length).toBe(1);
    });
  });

  describe("periodic flush", () => {
    it("automatically flushes on interval", async () => {
      const manager = new StreamingLogManager(env, "task_periodic", {
        flushIntervalMs: 5000,
        maxBufferSize: 100,
      });

      await manager.addLog("message", "Periodic test");

      // Advance timer to trigger flush
      await vi.advanceTimersByTimeAsync(5000);

      // R2 should have been written
      expect(env.ARTIFACTS.put).toHaveBeenCalled();

      await manager.finalize();
    });
  });
});

describe("formatLogEntry", () => {
  it("formats log entry with timestamp and event", () => {
    const entry = formatLogEntry("error", "Something went wrong");
    expect(entry).toMatch(
      /^\[\d{4}-\d{2}-\d{2}T.+\] \[error\] Something went wrong$/,
    );
  });
});

describe("storeLogsToR2", () => {
  let mockR2: Map<
    string,
    { content: string; metadata: Record<string, string> }
  >;
  let env: Env;

  beforeEach(() => {
    mockR2 = new Map();
    env = {
      TASKS: {} as KVNamespace,
      API_KEYS: {} as KVNamespace,
      RATE_LIMITS: {} as KVNamespace,
      USAGE: {} as KVNamespace,
      ARTIFACTS: {
        put: vi.fn(
          async (
            key: string,
            value: string,
            options?: { customMetadata?: Record<string, string> },
          ) => {
            mockR2.set(key, {
              content: value,
              metadata: options?.customMetadata ?? {},
            });
          },
        ),
        get: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        head: vi.fn(),
      } as unknown as R2Bucket,
      CLAUDE_RUNNER: {} as DurableObjectNamespace,
      ENVIRONMENT: "test",
    };
  });

  it("stores string logs with metadata", async () => {
    await storeLogsToR2(env, "task_str", "Log content here");

    expect(env.ARTIFACTS.put).toHaveBeenCalledWith(
      "task_str/logs.txt",
      "Log content here",
      expect.objectContaining({
        customMetadata: expect.objectContaining({
          taskId: "task_str",
          status: "complete",
        }),
      }),
    );
  });

  it("stores array logs joined by newlines", async () => {
    await storeLogsToR2(env, "task_arr", ["Line 1", "Line 2", "Line 3"]);

    const stored = mockR2.get("task_arr/logs.txt");
    expect(stored?.content).toBe("Line 1\nLine 2\nLine 3");
  });

  it("does nothing for empty content", async () => {
    await storeLogsToR2(env, "task_empty", "");
    expect(env.ARTIFACTS.put).not.toHaveBeenCalled();

    await storeLogsToR2(env, "task_empty_arr", []);
    expect(env.ARTIFACTS.put).not.toHaveBeenCalled();
  });
});

describe("getLogMetadata", () => {
  let env: Env;

  beforeEach(() => {
    env = {
      TASKS: {} as KVNamespace,
      API_KEYS: {} as KVNamespace,
      RATE_LIMITS: {} as KVNamespace,
      USAGE: {} as KVNamespace,
      ARTIFACTS: {
        put: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        head: vi.fn(),
      } as unknown as R2Bucket,
      CLAUDE_RUNNER: {} as DurableObjectNamespace,
      ENVIRONMENT: "test",
    };
  });

  it("returns metadata when logs exist", async () => {
    (env.ARTIFACTS.head as ReturnType<typeof vi.fn>).mockResolvedValue({
      customMetadata: {
        taskId: "task_meta",
        createdAt: "2026-01-09T00:00:00Z",
        updatedAt: "2026-01-09T00:05:00Z",
        lineCount: "42",
        status: "streaming",
      },
    });

    const metadata = await getLogMetadata(env, "task_meta");

    expect(metadata).toEqual({
      taskId: "task_meta",
      createdAt: "2026-01-09T00:00:00Z",
      updatedAt: "2026-01-09T00:05:00Z",
      lineCount: "42",
      status: "streaming",
    });
  });

  it("returns null when logs do not exist", async () => {
    (env.ARTIFACTS.head as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const metadata = await getLogMetadata(env, "task_missing");
    expect(metadata).toBeNull();
  });
});
