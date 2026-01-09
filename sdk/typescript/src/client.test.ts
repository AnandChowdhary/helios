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

      const client = new HeliosClient({ apiKey: mockApiKey, baseUrl: mockBaseUrl });
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

      const client = new HeliosClient({ apiKey: mockApiKey, baseUrl: mockBaseUrl });

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

      const client = new HeliosClient({ apiKey: mockApiKey, baseUrl: mockBaseUrl });
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

      const client = new HeliosClient({ apiKey: mockApiKey, baseUrl: mockBaseUrl });
      await expect(client.getTask("nonexistent")).rejects.toThrow("Task not found");
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

      const client = new HeliosClient({ apiKey: mockApiKey, baseUrl: mockBaseUrl });
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

  describe("getTaskLogs", () => {
    it("retrieves task logs as text", async () => {
      const mockLogs = "Log line 1\nLog line 2\n";

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockLogs),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = new HeliosClient({ apiKey: mockApiKey, baseUrl: mockBaseUrl });
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

      const client = new HeliosClient({ apiKey: mockApiKey, baseUrl: mockBaseUrl });
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

      const client = new HeliosClient({ apiKey: mockApiKey, baseUrl: mockBaseUrl });
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
            pullRequest: { url: "https://github.com/test/repo/pull/1", number: 1 },
          }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = new HeliosClient({ apiKey: mockApiKey, baseUrl: mockBaseUrl });
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

      const client = new HeliosClient({ apiKey: mockApiKey, baseUrl: mockBaseUrl });
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

      const client = new HeliosClient({ apiKey: mockApiKey, baseUrl: mockBaseUrl });

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
});
