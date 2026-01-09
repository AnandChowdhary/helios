import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HeliosClient, HeliosError } from "./client.js";

describe("HeliosClient", () => {
  const mockApiKey = "test-api-key";
  const mockBaseUrl = "https://test.example.com";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("throws error when API key is missing", () => {
      expect(() => new HeliosClient({ apiKey: "" })).toThrow(
        "API key is required",
      );
    });

    it("creates client with valid config", () => {
      const client = new HeliosClient({ apiKey: mockApiKey });
      expect(client).toBeInstanceOf(HeliosClient);
    });

    it("removes trailing slash from base URL", () => {
      const client = new HeliosClient({
        apiKey: mockApiKey,
        baseUrl: "https://test.example.com/",
      });
      expect(client).toBeInstanceOf(HeliosClient);
    });
  });

  describe("createTaskAsync", () => {
    it("sends correct request for async task creation", async () => {
      const mockResponse = {
        taskId: "task_123",
        status: "pending",
        createdAt: "2025-01-01T00:00:00Z",
        statusUrl: "https://test.example.com/v1/tasks/task_123",
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = new HeliosClient({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });
      const result = await client.createTaskAsync({
        prompt: "Test prompt",
        repository: { url: "https://github.com/test/repo.git" },
        claude: { apiKey: "sk-ant-test" },
      });

      expect(fetchMock).toHaveBeenCalledWith(
        `${mockBaseUrl}/v1/tasks`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockApiKey}`,
            "Content-Type": "application/json",
          }),
        }),
      );

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.output.mode).toBe("async");
      expect(result).toEqual(mockResponse);
    });

    it("throws HeliosError on API error", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: "Invalid API key" } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = new HeliosClient({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });

      await expect(
        client.createTaskAsync({
          prompt: "Test",
          repository: { url: "https://github.com/test/repo.git" },
          claude: { apiKey: "sk-ant-test" },
        }),
      ).rejects.toThrow(HeliosError);
    });
  });

  describe("getTask", () => {
    it("retrieves task by ID", async () => {
      const mockTask = {
        id: "task_123",
        status: "completed",
        prompt: "Test",
        repository: { url: "https://github.com/test/repo.git", branch: "main" },
        createdAt: "2025-01-01T00:00:00Z",
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTask),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = new HeliosClient({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });
      const result = await client.getTask("task_123");

      expect(fetchMock).toHaveBeenCalledWith(
        `${mockBaseUrl}/v1/tasks/task_123`,
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockApiKey}`,
          }),
        }),
      );
      expect(result).toEqual(mockTask);
    });

    it("throws on not found", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: { message: "Task not found" } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = new HeliosClient({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });
      await expect(client.getTask("nonexistent")).rejects.toThrow(
        "Task not found",
      );
    });
  });

  describe("cancelTask", () => {
    it("cancels a task", async () => {
      const mockResponse = {
        taskId: "task_123",
        status: "cancelled",
        cancelledAt: "2025-01-01T00:00:00Z",
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = new HeliosClient({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });
      const result = await client.cancelTask("task_123");

      expect(fetchMock).toHaveBeenCalledWith(
        `${mockBaseUrl}/v1/tasks/task_123/cancel`,
        expect.objectContaining({
          method: "POST",
        }),
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe("getRateLimit", () => {
    it("retrieves rate limit status", async () => {
      const mockResponse = {
        rateLimit: {
          limit: 100,
          current: 5,
          remaining: 95,
          resetAt: "2025-01-01T00:01:00Z",
          resetAtUnix: 1704067260000,
          windowMs: 60000,
        },
        concurrentTasks: {
          limit: 5,
          active: 2,
          remaining: 3,
        },
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = new HeliosClient({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });
      const result = await client.getRateLimit();

      expect(fetchMock).toHaveBeenCalledWith(
        `${mockBaseUrl}/v1/rate-limit`,
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockApiKey}`,
          }),
        }),
      );
      expect(result.rateLimit.limit).toBe(100);
      expect(result.rateLimit.remaining).toBe(95);
      expect(result.concurrentTasks.active).toBe(2);
      expect(result.concurrentTasks.limit).toBe(5);
    });
  });

  describe("getTaskLogs", () => {
    it("retrieves task logs as text", async () => {
      const mockLogs = "Log line 1\nLog line 2\n";

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockLogs),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = new HeliosClient({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });
      const result = await client.getTaskLogs("task_123");

      expect(fetchMock).toHaveBeenCalledWith(
        `${mockBaseUrl}/v1/tasks/task_123/logs`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockApiKey}`,
          }),
        }),
      );
      expect(result).toBe(mockLogs);
    });
  });

  describe("getTaskDiff", () => {
    it("retrieves task diff as text", async () => {
      const mockDiff = "diff --git a/file.ts b/file.ts\n";

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockDiff),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = new HeliosClient({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });
      const result = await client.getTaskDiff("task_123");

      expect(fetchMock).toHaveBeenCalledWith(
        `${mockBaseUrl}/v1/tasks/task_123/diff`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockApiKey}`,
          }),
        }),
      );
      expect(result).toBe(mockDiff);
    });
  });

  describe("pushTaskChanges", () => {
    it("pushes changes to remote", async () => {
      const mockResponse = {
        taskId: "task_123",
        success: true,
        branch: "claude/fix",
        message: "Changes pushed successfully",
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = new HeliosClient({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });
      const result = await client.pushTaskChanges("task_123", {
        branch: "claude/fix",
        credentials: { type: "token", value: "ghp_test" },
      });

      expect(fetchMock).toHaveBeenCalledWith(
        `${mockBaseUrl}/v1/tasks/task_123/push`,
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("claude/fix"),
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it("includes PR options when creating PR", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            taskId: "task_123",
            success: true,
            pullRequest: {
              url: "https://github.com/test/repo/pull/1",
              number: 1,
            },
          }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = new HeliosClient({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });
      await client.pushTaskChanges("task_123", {
        branch: "claude/fix",
        credentials: { type: "token", value: "ghp_test" },
        createPR: true,
        prTitle: "Fix bug",
        prBody: "This fixes the bug",
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.createPR).toBe(true);
      expect(body.prTitle).toBe("Fix bug");
      expect(body.prBody).toBe("This fixes the bug");
    });
  });

  describe("waitForTask", () => {
    it("polls until task completes", async () => {
      const pendingTask = {
        id: "task_123",
        status: "running",
        prompt: "Test",
        repository: { url: "https://github.com/test/repo.git", branch: "main" },
        createdAt: "2025-01-01T00:00:00Z",
      };

      const completedTask = {
        ...pendingTask,
        status: "completed",
        completedAt: "2025-01-01T00:01:00Z",
      };

      let callCount = 0;
      const fetchMock = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(callCount < 3 ? pendingTask : completedTask),
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = new HeliosClient({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });
      const onPoll = vi.fn();
      const result = await client.waitForTask("task_123", {
        intervalMs: 10,
        onPoll,
      });

      expect(result.status).toBe("completed");
      expect(onPoll).toHaveBeenCalledTimes(3);
    });

    it("throws on timeout", async () => {
      const runningTask = {
        id: "task_123",
        status: "running",
        prompt: "Test",
        repository: { url: "https://github.com/test/repo.git", branch: "main" },
        createdAt: "2025-01-01T00:00:00Z",
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(runningTask),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = new HeliosClient({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });

      await expect(
        client.waitForTask("task_123", {
          intervalMs: 10,
          timeoutMs: 50,
        }),
      ).rejects.toThrow(/Timeout/);
    });
  });
});

describe("HeliosError", () => {
  it("has correct name and properties", () => {
    const error = new HeliosError("Test error", 404, "NOT_FOUND");
    expect(error.name).toBe("HeliosError");
    expect(error.message).toBe("Test error");
    expect(error.status).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
  });

  it("marks 5xx errors as retryable", () => {
    const error500 = new HeliosError("Server error", 500);
    const error503 = new HeliosError("Service unavailable", 503);
    expect(error500.retryable).toBe(true);
    expect(error503.retryable).toBe(true);
  });

  it("marks 429 rate limit as retryable", () => {
    const error = new HeliosError("Rate limited", 429);
    expect(error.retryable).toBe(true);
  });

  it("marks 4xx client errors as non-retryable", () => {
    const error400 = new HeliosError("Bad request", 400);
    const error401 = new HeliosError("Unauthorized", 401);
    const error404 = new HeliosError("Not found", 404);
    expect(error400.retryable).toBe(false);
    expect(error401.retryable).toBe(false);
    expect(error404.retryable).toBe(false);
  });
});

describe("Retry behavior", () => {
  const mockApiKey = "test-api-key";
  const mockBaseUrl = "https://test.example.com";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries on 500 server error and succeeds", async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () =>
            Promise.resolve({ error: { message: "Server error" } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "task_123",
            status: "completed",
          }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new HeliosClient({
      apiKey: mockApiKey,
      baseUrl: mockBaseUrl,
      retry: {
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 50,
      },
    });

    const result = await client.getTask("task_123");
    expect(result.id).toBe("task_123");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries on 429 rate limit", async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          json: () =>
            Promise.resolve({
              error: { message: "Rate limited", code: "RATE_LIMIT_EXCEEDED" },
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: "task_123", status: "completed" }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new HeliosClient({
      apiKey: mockApiKey,
      baseUrl: mockBaseUrl,
      retry: { maxRetries: 2, initialDelayMs: 10 },
    });

    const result = await client.getTask("task_123");
    expect(result.id).toBe("task_123");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 400 client error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({ error: { message: "Bad request" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new HeliosClient({
      apiKey: mockApiKey,
      baseUrl: mockBaseUrl,
      retry: { maxRetries: 3, initialDelayMs: 10 },
    });

    await expect(client.getTask("task_123")).rejects.toThrow("Bad request");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("exhausts retries and throws last error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () =>
        Promise.resolve({ error: { message: "Service unavailable" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new HeliosClient({
      apiKey: mockApiKey,
      baseUrl: mockBaseUrl,
      retry: { maxRetries: 2, initialDelayMs: 10 },
    });

    await expect(client.getTask("task_123")).rejects.toThrow(
      "Service unavailable",
    );
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("disables retry when retry is false", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () =>
        Promise.resolve({ error: { message: "Server error" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new HeliosClient({
      apiKey: mockApiKey,
      baseUrl: mockBaseUrl,
      retry: false,
    });

    await expect(client.getTask("task_123")).rejects.toThrow("Server error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("respects retryOnRateLimit: false", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () =>
        Promise.resolve({ error: { message: "Rate limited" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new HeliosClient({
      apiKey: mockApiKey,
      baseUrl: mockBaseUrl,
      retry: { maxRetries: 3, initialDelayMs: 10, retryOnRateLimit: false },
    });

    await expect(client.getTask("task_123")).rejects.toThrow("Rate limited");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("includes error code in HeliosError", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({
          error: { message: "Task not found", code: "TASK_NOT_FOUND" },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new HeliosClient({
      apiKey: mockApiKey,
      baseUrl: mockBaseUrl,
    });

    try {
      await client.getTask("task_123");
    } catch (error) {
      expect(error).toBeInstanceOf(HeliosError);
      expect((error as HeliosError).code).toBe("TASK_NOT_FOUND");
      expect((error as HeliosError).status).toBe(404);
    }
  });
});
