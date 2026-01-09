import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { usageRouter } from "../../src/routes/usage";
import { errorHandler } from "../../src/utils/errors";
import {
  trackRequest,
  trackTaskCreated,
  trackTaskCompleted,
  getDailyUsage,
  getUsageSummary,
  getCurrentMonthUsage,
  calculateCost,
} from "../../src/services/usage";
import type {
  Env,
  ApiKey,
  Task,
  DailyUsage,
  UsageSummary,
} from "../../src/types";

interface ErrorResponse {
  error: {
    message: string;
  };
}

// Mock KV store
class MockKVNamespace {
  private store = new Map<string, string>();

  async get<T>(key: string, format?: string): Promise<T | null> {
    const value = this.store.get(key);
    if (!value) return null;
    return format === "json" ? JSON.parse(value) : (value as unknown as T);
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(): Promise<{ keys: { name: string }[] }> {
    return { keys: Array.from(this.store.keys()).map((name) => ({ name })) };
  }

  // For test inspection
  _getStore() {
    return this.store;
  }
}

function createMockEnv(usageKV?: MockKVNamespace): Env {
  return {
    API_KEYS: new MockKVNamespace() as unknown as KVNamespace,
    TASKS: new MockKVNamespace() as unknown as KVNamespace,
    RATE_LIMITS: new MockKVNamespace() as unknown as KVNamespace,
    USAGE: (usageKV || new MockKVNamespace()) as unknown as KVNamespace,
    ARTIFACTS: {} as R2Bucket,
    CLAUDE_RUNNER: {} as DurableObjectNamespace,
    ENVIRONMENT: "test",
  };
}

describe("Usage Service", () => {
  describe("calculateCost", () => {
    it("calculates cost correctly for input tokens", () => {
      // $3 per 1M input tokens
      const cost = calculateCost(1_000_000, 0);
      expect(cost).toBe(3);
    });

    it("calculates cost correctly for output tokens", () => {
      // $15 per 1M output tokens
      const cost = calculateCost(0, 1_000_000);
      expect(cost).toBe(15);
    });

    it("calculates combined cost correctly", () => {
      // 500k input ($1.5) + 100k output ($1.5) = $3
      const cost = calculateCost(500_000, 100_000);
      expect(cost).toBe(3);
    });

    it("returns 0 for no tokens", () => {
      const cost = calculateCost(0, 0);
      expect(cost).toBe(0);
    });

    it("rounds to 2 decimal places", () => {
      // Small token counts that would result in many decimal places
      const cost = calculateCost(1000, 500);
      expect(cost.toString().split(".")[1]?.length || 0).toBeLessThanOrEqual(2);
    });
  });

  describe("trackRequest", () => {
    it("increments request count for API key", async () => {
      const usageKV = new MockKVNamespace();
      const env = createMockEnv(usageKV);
      const apiKeyId = "key_test123";

      await trackRequest(env, apiKeyId);

      const today = new Date().toISOString().split("T")[0];
      const usage = await getDailyUsage(env, apiKeyId, today);
      expect(usage.requests).toBe(1);
    });

    it("increments existing request count", async () => {
      const usageKV = new MockKVNamespace();
      const env = createMockEnv(usageKV);
      const apiKeyId = "key_test123";

      await trackRequest(env, apiKeyId);
      await trackRequest(env, apiKeyId);
      await trackRequest(env, apiKeyId);

      const today = new Date().toISOString().split("T")[0];
      const usage = await getDailyUsage(env, apiKeyId, today);
      expect(usage.requests).toBe(3);
    });
  });

  describe("trackTaskCreated", () => {
    it("increments task created count", async () => {
      const usageKV = new MockKVNamespace();
      const env = createMockEnv(usageKV);
      const apiKeyId = "key_test123";

      await trackTaskCreated(env, apiKeyId);

      const today = new Date().toISOString().split("T")[0];
      const usage = await getDailyUsage(env, apiKeyId, today);
      expect(usage.tasksCreated).toBe(1);
    });
  });

  describe("trackTaskCompleted", () => {
    it("tracks completed task with token usage", async () => {
      const usageKV = new MockKVNamespace();
      const env = createMockEnv(usageKV);
      const apiKeyId = "key_test123";

      const task: Task = {
        id: "task_123",
        status: "completed",
        prompt: "Test prompt",
        repository: { url: "https://github.com/test/repo", branch: "main" },
        createdAt: new Date(Date.now() - 60000).toISOString(),
        startedAt: new Date(Date.now() - 30000).toISOString(),
        completedAt: new Date().toISOString(),
        result: {
          success: true,
          summary: "Task completed",
          filesChanged: [],
          usage: { inputTokens: 1000, outputTokens: 500 },
        },
      };

      await trackTaskCompleted(env, apiKeyId, task);

      const today = new Date().toISOString().split("T")[0];
      const usage = await getDailyUsage(env, apiKeyId, today);
      expect(usage.tasksCompleted).toBe(1);
      expect(usage.inputTokens).toBe(1000);
      expect(usage.outputTokens).toBe(500);
      expect(usage.totalDurationMs).toBeGreaterThan(0);
    });

    it("tracks failed task", async () => {
      const usageKV = new MockKVNamespace();
      const env = createMockEnv(usageKV);
      const apiKeyId = "key_test123";

      const task: Task = {
        id: "task_123",
        status: "failed",
        prompt: "Test prompt",
        repository: { url: "https://github.com/test/repo", branch: "main" },
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        error: "Something went wrong",
      };

      await trackTaskCompleted(env, apiKeyId, task);

      const today = new Date().toISOString().split("T")[0];
      const usage = await getDailyUsage(env, apiKeyId, today);
      expect(usage.tasksFailed).toBe(1);
      expect(usage.tasksCompleted).toBe(0);
    });

    it("tracks cancelled task", async () => {
      const usageKV = new MockKVNamespace();
      const env = createMockEnv(usageKV);
      const apiKeyId = "key_test123";

      const task: Task = {
        id: "task_123",
        status: "cancelled",
        prompt: "Test prompt",
        repository: { url: "https://github.com/test/repo", branch: "main" },
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      await trackTaskCompleted(env, apiKeyId, task);

      const today = new Date().toISOString().split("T")[0];
      const usage = await getDailyUsage(env, apiKeyId, today);
      expect(usage.tasksCancelled).toBe(1);
    });
  });

  describe("getDailyUsage", () => {
    it("returns empty usage for non-existent date", async () => {
      const usageKV = new MockKVNamespace();
      const env = createMockEnv(usageKV);

      const usage = await getDailyUsage(env, "key_test", "2024-01-01");
      expect(usage.apiKeyId).toBe("key_test");
      expect(usage.date).toBe("2024-01-01");
      expect(usage.requests).toBe(0);
      expect(usage.tasksCreated).toBe(0);
      expect(usage.tasksCompleted).toBe(0);
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
    });
  });

  describe("getUsageSummary", () => {
    it("aggregates usage across multiple days", async () => {
      const usageKV = new MockKVNamespace();
      const env = createMockEnv(usageKV);
      const apiKeyId = "key_test123";

      // Seed some usage data
      const day1: DailyUsage = {
        apiKeyId,
        date: "2024-01-01",
        requests: 10,
        tasksCreated: 5,
        tasksCompleted: 4,
        tasksFailed: 1,
        tasksCancelled: 0,
        inputTokens: 10000,
        outputTokens: 5000,
        totalDurationMs: 60000,
      };

      const day2: DailyUsage = {
        apiKeyId,
        date: "2024-01-02",
        requests: 20,
        tasksCreated: 10,
        tasksCompleted: 8,
        tasksFailed: 2,
        tasksCancelled: 0,
        inputTokens: 20000,
        outputTokens: 10000,
        totalDurationMs: 120000,
      };

      await usageKV.put(`${apiKeyId}:2024-01-01`, JSON.stringify(day1));
      await usageKV.put(`${apiKeyId}:2024-01-02`, JSON.stringify(day2));

      const summary = await getUsageSummary(
        env,
        apiKeyId,
        "2024-01-01",
        "2024-01-02",
      );

      expect(summary.apiKeyId).toBe(apiKeyId);
      expect(summary.period.start).toBe("2024-01-01");
      expect(summary.period.end).toBe("2024-01-02");
      expect(summary.totals.requests).toBe(30);
      expect(summary.totals.tasksCreated).toBe(15);
      expect(summary.totals.tasksCompleted).toBe(12);
      expect(summary.totals.tasksFailed).toBe(3);
      expect(summary.totals.inputTokens).toBe(30000);
      expect(summary.totals.outputTokens).toBe(15000);
      expect(summary.totals.totalDurationMs).toBe(180000);
      expect(summary.totals.estimatedCost).toBeGreaterThan(0);
      expect(summary.daily).toHaveLength(2);
    });

    it("excludes days with no activity", async () => {
      const usageKV = new MockKVNamespace();
      const env = createMockEnv(usageKV);
      const apiKeyId = "key_test123";

      const day1: DailyUsage = {
        apiKeyId,
        date: "2024-01-01",
        requests: 10,
        tasksCreated: 5,
        tasksCompleted: 4,
        tasksFailed: 1,
        tasksCancelled: 0,
        inputTokens: 10000,
        outputTokens: 5000,
        totalDurationMs: 60000,
      };

      await usageKV.put(`${apiKeyId}:2024-01-01`, JSON.stringify(day1));
      // No data for 2024-01-02

      const summary = await getUsageSummary(
        env,
        apiKeyId,
        "2024-01-01",
        "2024-01-03",
      );

      expect(summary.daily).toHaveLength(1);
      expect(summary.daily[0].date).toBe("2024-01-01");
    });
  });

  describe("getCurrentMonthUsage", () => {
    it("returns usage for current month", async () => {
      const usageKV = new MockKVNamespace();
      const env = createMockEnv(usageKV);
      const apiKeyId = "key_test123";

      // Add some usage for today
      await trackRequest(env, apiKeyId);
      await trackTaskCreated(env, apiKeyId);

      const summary = await getCurrentMonthUsage(env, apiKeyId);

      const now = new Date();
      const expectedStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

      expect(summary.period.start).toBe(expectedStart);
      expect(summary.totals.requests).toBe(1);
      expect(summary.totals.tasksCreated).toBe(1);
    });
  });
});

describe("Usage Router", () => {
  let app: Hono<{ Bindings: Env }>;
  let usageKV: MockKVNamespace;
  let apiKeysKV: MockKVNamespace;

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
    usageKV = new MockKVNamespace();
    apiKeysKV = new MockKVNamespace();

    app = new Hono<{ Bindings: Env }>();
    app.onError(errorHandler);

    // Set API key in context (simulating auth middleware)
    app.use("*", async (c, next) => {
      c.set("apiKey", validApiKey);
      await next();
    });

    app.route("/v1/usage", usageRouter);
  });

  function createMockEnvWithKVs(): Env {
    return {
      API_KEYS: apiKeysKV as unknown as KVNamespace,
      TASKS: new MockKVNamespace() as unknown as KVNamespace,
      RATE_LIMITS: new MockKVNamespace() as unknown as KVNamespace,
      USAGE: usageKV as unknown as KVNamespace,
      ARTIFACTS: {} as R2Bucket,
      CLAUDE_RUNNER: {} as DurableObjectNamespace,
      ENVIRONMENT: "test",
    };
  }

  describe("GET /v1/usage", () => {
    it("returns current month usage when no dates specified", async () => {
      const env = createMockEnvWithKVs();

      // Add some usage data for today
      const today = new Date().toISOString().split("T")[0];
      const usage: DailyUsage = {
        apiKeyId: "key_test",
        date: today,
        requests: 5,
        tasksCreated: 2,
        tasksCompleted: 1,
        tasksFailed: 1,
        tasksCancelled: 0,
        inputTokens: 5000,
        outputTokens: 2500,
        totalDurationMs: 30000,
      };
      await usageKV.put(`key_test:${today}`, JSON.stringify(usage));

      const res = await app.fetch(
        new Request("http://localhost/v1/usage"),
        env,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as UsageSummary;
      expect(body.apiKeyId).toBe("key_test");
      expect(body.totals.requests).toBe(5);
    });

    it("returns usage for specified date range", async () => {
      const env = createMockEnvWithKVs();

      const usage: DailyUsage = {
        apiKeyId: "key_test",
        date: "2024-01-15",
        requests: 10,
        tasksCreated: 5,
        tasksCompleted: 4,
        tasksFailed: 1,
        tasksCancelled: 0,
        inputTokens: 10000,
        outputTokens: 5000,
        totalDurationMs: 60000,
      };
      await usageKV.put("key_test:2024-01-15", JSON.stringify(usage));

      const res = await app.fetch(
        new Request(
          "http://localhost/v1/usage?start=2024-01-01&end=2024-01-31",
        ),
        env,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as UsageSummary;
      expect(body.period.start).toBe("2024-01-01");
      expect(body.period.end).toBe("2024-01-31");
      expect(body.totals.requests).toBe(10);
    });

    it("rejects invalid start date format", async () => {
      const env = createMockEnvWithKVs();

      const res = await app.fetch(
        new Request("http://localhost/v1/usage?start=invalid-date"),
        env,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorResponse;
      expect(body.error.message).toContain("Invalid start date format");
    });

    it("rejects invalid end date format", async () => {
      const env = createMockEnvWithKVs();

      const res = await app.fetch(
        new Request(
          "http://localhost/v1/usage?start=2024-01-01&end=not-a-date",
        ),
        env,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorResponse;
      expect(body.error.message).toContain("Invalid end date format");
    });

    it("rejects when start date is after end date", async () => {
      const env = createMockEnvWithKVs();

      const res = await app.fetch(
        new Request(
          "http://localhost/v1/usage?start=2024-02-01&end=2024-01-01",
        ),
        env,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorResponse;
      expect(body.error.message).toContain("Start date cannot be after");
    });

    it("rejects date range exceeding 90 days", async () => {
      const env = createMockEnvWithKVs();

      const res = await app.fetch(
        new Request(
          "http://localhost/v1/usage?start=2024-01-01&end=2024-06-01",
        ),
        env,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorResponse;
      expect(body.error.message).toContain("cannot exceed 90 days");
    });
  });

  describe("GET /v1/usage/current", () => {
    it("returns current month usage", async () => {
      const env = createMockEnvWithKVs();

      // Add usage data for today
      const today = new Date().toISOString().split("T")[0];
      const usage: DailyUsage = {
        apiKeyId: "key_test",
        date: today,
        requests: 3,
        tasksCreated: 1,
        tasksCompleted: 1,
        tasksFailed: 0,
        tasksCancelled: 0,
        inputTokens: 3000,
        outputTokens: 1500,
        totalDurationMs: 15000,
      };
      await usageKV.put(`key_test:${today}`, JSON.stringify(usage));

      const res = await app.fetch(
        new Request("http://localhost/v1/usage/current"),
        env,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as UsageSummary;
      expect(body.apiKeyId).toBe("key_test");
      expect(body.totals.requests).toBe(3);
    });
  });
});
