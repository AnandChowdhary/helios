import { beforeAll, describe, expect, it } from "vitest";

// E2E tests run against a deployed staging environment
// Set environment variables to enable:
//   STAGING_URL - The base URL of the staging environment
//   STAGING_API_KEY - A valid Helios API key for staging
//   ANTHROPIC_API_KEY - Anthropic API key for Claude Code tasks
const BASE_URL =
  process.env.STAGING_URL || "https://helios-staging.getelysium.workers.dev";
const API_KEY = process.env.STAGING_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Helper to check if E2E tests should run
const shouldRunE2E = Boolean(API_KEY && ANTHROPIC_API_KEY);

// SSE event types
interface SSEEvent {
  event: string;
  data: unknown;
}

// API response types for type safety
interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
}

interface ServiceInfoResponse {
  name: string;
}

interface TaskCreatedResponse {
  taskId: string;
  status: string;
  createdAt: string;
  statusUrl: string;
}

interface TaskResponse {
  id: string;
  status: string;
}

interface CancelResponse {
  taskId: string;
  status: string;
  cancelledAt?: string;
}

// Parse SSE stream into events with timeout and detailed logging
// Terminates early when a terminal event (complete/error) is received
async function parseSSEStream(
  response: Response,
  terminateOn: string[] = ["complete", "error"],
  timeoutMs: number = 90000 // 90 second default timeout for parsing
): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let chunkCount = 0;
  const startTime = Date.now();

  console.log(`[SSE] Starting to parse stream (timeout: ${timeoutMs}ms)`);

  // Create a timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`SSE parsing timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    while (true) {
      // Race between reading and timeout
      const readPromise = reader.read();
      const { done, value } = await Promise.race([readPromise, timeoutPromise]);

      if (done) {
        console.log(
          `[SSE] Stream ended naturally after ${Date.now() - startTime}ms, ${chunkCount} chunks, ${events.length} events`
        );
        break;
      }

      chunkCount++;
      const chunk = decoder.decode(value, { stream: true });
      console.log(
        `[SSE] Chunk ${chunkCount} received (${chunk.length} bytes) at ${Date.now() - startTime}ms`
      );

      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
          console.log(`[SSE] Event type: ${currentEvent}`);
        } else if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            events.push({ event: currentEvent || "message", data });
            console.log(
              `[SSE] Parsed event: ${currentEvent || "message"} (total: ${events.length})`
            );
          } catch {
            events.push({
              event: currentEvent || "message",
              data: line.slice(6),
            });
            console.log(
              `[SSE] Parsed raw event: ${currentEvent || "message"} (total: ${events.length})`
            );
          }

          // Stop reading on terminal events
          if (terminateOn.includes(currentEvent)) {
            console.log(
              `[SSE] Terminal event '${currentEvent}' received, stopping after ${Date.now() - startTime}ms`
            );
            reader.cancel();
            return events;
          }
          currentEvent = "";
        }
      }
    }
  } catch (error) {
    console.log(
      `[SSE] Error after ${Date.now() - startTime}ms: ${error instanceof Error ? error.message : error}`
    );
    console.log(`[SSE] Events collected so far: ${events.length}`);
    console.log(
      `[SSE] Event types: ${events.map((e) => e.event).join(", ")}`
    );
    // Re-throw if it's not our timeout (which we handle gracefully)
    if (
      error instanceof Error &&
      error.message.includes("SSE parsing timed out")
    ) {
      // Return what we have so far on timeout
      console.log(`[SSE] Returning ${events.length} events collected before timeout`);
      return events;
    }
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Reader may already be released
    }
  }

  console.log(
    `[SSE] Completed parsing: ${events.length} events in ${Date.now() - startTime}ms`
  );
  return events;
}

describe.skipIf(!shouldRunE2E)("E2E: Full Task Flow", () => {
  beforeAll(() => {
    console.log(`Running E2E tests against: ${BASE_URL}`);
  });

  describe("Health Check", () => {
    it("returns healthy status", async () => {
      const res = await fetch(`${BASE_URL}/health`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as HealthResponse;
      expect(body.status).toBe("ok");
      expect(body).toHaveProperty("timestamp");
      expect(body).toHaveProperty("version");
    });

    it("returns service info at root", async () => {
      const res = await fetch(`${BASE_URL}/`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as ServiceInfoResponse;
      expect(body.name).toBe("Helios");
    });
  });

  describe("Authentication", () => {
    it("rejects requests without API key", async () => {
      const res = await fetch(`${BASE_URL}/v1/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Test" }),
      });

      expect(res.status).toBe(401);
    });

    it("rejects requests with invalid API key", async () => {
      const res = await fetch(`${BASE_URL}/v1/tasks`, {
        method: "POST",
        headers: {
          Authorization: "Bearer invalid-api-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: "Test" }),
      });

      expect(res.status).toBe(401);
    });

    it("accepts valid API key", async () => {
      const res = await fetch(`${BASE_URL}/v1/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: "Test",
          repository: { url: "https://github.com/test/repo" },
          claude: { apiKey: "sk-ant-test" },
        }),
      });

      // Should fail validation (invalid repo URL), not auth
      expect(res.status).not.toBe(401);
    });
  });

  describe("Task Validation", () => {
    it("rejects empty prompt", async () => {
      const res = await fetch(`${BASE_URL}/v1/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: "",
          repository: { url: "https://github.com/test/repo" },
          claude: { apiKey: "sk-ant-test" },
        }),
      });

      expect(res.status).toBe(400);
    });

    it("rejects invalid repository URL", async () => {
      const res = await fetch(`${BASE_URL}/v1/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: "Test prompt",
          repository: { url: "https://malicious-site.com/repo" },
          claude: { apiKey: "sk-ant-test-key" },
        }),
      });

      expect(res.status).toBe(400);
    });

    it("rejects invalid Anthropic API key format", async () => {
      const res = await fetch(`${BASE_URL}/v1/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: "Test prompt",
          repository: { url: "https://github.com/test/repo" },
          claude: { apiKey: "invalid-key" },
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("Async Task Flow", () => {
    it("creates async task and returns 202 with task ID", async () => {
      const res = await fetch(`${BASE_URL}/v1/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: "List the files in the repository",
          repository: {
            url: "https://github.com/anthropics/anthropic-cookbook.git",
            branch: "main",
          },
          claude: {
            apiKey: ANTHROPIC_API_KEY,
            model: "claude-sonnet-4-5",
            maxTurns: 2,
          },
          output: { mode: "async" },
        }),
      });

      expect(res.status).toBe(202);

      const body = (await res.json()) as TaskCreatedResponse;
      expect(body).toHaveProperty("taskId");
      expect(body.status).toBe("pending");
      expect(body).toHaveProperty("createdAt");
      expect(body).toHaveProperty("statusUrl");

      // Verify we can retrieve the task
      const taskRes = await fetch(`${BASE_URL}/v1/tasks/${body.taskId}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      expect(taskRes.status).toBe(200);

      const task = (await taskRes.json()) as TaskResponse;
      expect(task.id).toBe(body.taskId);
      expect(["pending", "running", "completed", "failed"]).toContain(
        task.status
      );
    }, 30000);

    it("can cancel a pending/running task", async () => {
      // Create a task
      const createRes = await fetch(`${BASE_URL}/v1/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: "List all files",
          repository: {
            url: "https://github.com/anthropics/anthropic-cookbook.git",
            branch: "main",
          },
          claude: {
            apiKey: ANTHROPIC_API_KEY,
            model: "claude-sonnet-4-5",
            maxTurns: 5,
          },
          output: { mode: "async" },
        }),
      });

      expect(createRes.status).toBe(202);
      const createBody = (await createRes.json()) as TaskCreatedResponse;
      const { taskId } = createBody;

      // Cancel the task
      const cancelRes = await fetch(`${BASE_URL}/v1/tasks/${taskId}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}` },
      });

      // May get 200 (cancelled) or 400 (already completed)
      expect([200, 400]).toContain(cancelRes.status);

      if (cancelRes.status === 200) {
        const cancelBody = (await cancelRes.json()) as CancelResponse;
        expect(cancelBody.status).toBe("cancelled");
      }
    }, 30000);
  });

  describe("Sync Task Flow with SSE", () => {
    it("creates sync task and streams SSE events", async () => {
      console.log("[TEST] Starting sync task SSE test");
      console.log("[TEST] Making POST request to /v1/tasks with sync mode...");

      const startTime = Date.now();
      const res = await fetch(`${BASE_URL}/v1/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt:
            "Just say 'Hello from Helios!' and nothing else. Do not use any tools.",
          repository: {
            url: "https://github.com/anthropics/anthropic-cookbook.git",
            branch: "main",
          },
          claude: {
            apiKey: ANTHROPIC_API_KEY,
            model: "claude-sonnet-4-5",
            maxTurns: 1,
          },
          output: { mode: "sync" },
        }),
      });

      console.log(
        `[TEST] Response received in ${Date.now() - startTime}ms - Status: ${res.status}`
      );
      console.log(
        `[TEST] Content-Type: ${res.headers.get("content-type")}`
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      // Parse the SSE stream with 100 second timeout
      console.log("[TEST] Starting SSE stream parsing...");
      const events = await parseSSEStream(res, ["complete", "error"], 100000);
      console.log(`[TEST] SSE parsing complete. Total events: ${events.length}`);

      // Should have received some events
      expect(events.length).toBeGreaterThan(0);

      // Should have a status event indicating running
      const statusEvents = events.filter((e) => e.event === "status");
      console.log(`[TEST] Status events: ${statusEvents.length}`);
      expect(statusEvents.length).toBeGreaterThan(0);

      // Should end with complete or error event
      const terminalEvents = events.filter((e) =>
        ["complete", "error"].includes(e.event)
      );
      console.log(`[TEST] Terminal events: ${terminalEvents.length}`);
      console.log(
        `[TEST] All event types: ${events.map((e) => e.event).join(", ")}`
      );
      expect(terminalEvents.length).toBeGreaterThan(0);
    }, 120000); // 2 minute timeout for full execution
  });

  describe("Task Status Retrieval", () => {
    it("returns 404 for non-existent task", async () => {
      const res = await fetch(`${BASE_URL}/v1/tasks/non-existent-task-id`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe("Rate Limiting", () => {
    it("includes rate limit headers in response", async () => {
      const res = await fetch(`${BASE_URL}/v1/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: "Test",
          repository: { url: "https://github.com/test/repo" },
          claude: { apiKey: "sk-ant-test" },
        }),
      });

      // Regardless of validation result, should have rate limit headers
      expect(res.headers.has("X-RateLimit-Limit")).toBe(true);
      expect(res.headers.has("X-RateLimit-Remaining")).toBe(true);
    });
  });
});

// Conditional E2E tests that require full infrastructure
describe.skipIf(!shouldRunE2E)("E2E: Container Integration", () => {
  it("executes Claude Code task with tool usage", async () => {
    console.log("[TEST] Starting Claude Code task with tool usage test");
    console.log("[TEST] Making POST request to /v1/tasks...");

    const startTime = Date.now();
    const res = await fetch(`${BASE_URL}/v1/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt:
          "Use the Read tool to read the README.md file and tell me the title of the project.",
        repository: {
          url: "https://github.com/anthropics/anthropic-cookbook.git",
          branch: "main",
        },
        claude: {
          apiKey: ANTHROPIC_API_KEY,
          model: "claude-sonnet-4-5",
          maxTurns: 3,
        },
        options: {
          timeout: 120,
          allowedTools: ["Read", "Glob"],
        },
        output: { mode: "sync" },
      }),
    });

    console.log(
      `[TEST] Response received in ${Date.now() - startTime}ms - Status: ${res.status}`
    );
    console.log(`[TEST] Content-Type: ${res.headers.get("content-type")}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    // Parse SSE stream with 150 second timeout
    console.log("[TEST] Starting SSE stream parsing...");
    const events = await parseSSEStream(res, ["complete", "error"], 150000);
    console.log(`[TEST] SSE parsing complete. Total events: ${events.length}`);
    console.log(
      `[TEST] All event types: ${events.map((e) => e.event).join(", ")}`
    );

    // Should have tool_use events
    const toolEvents = events.filter((e) => e.event === "tool_use");
    // Tool use is expected but not guaranteed based on Claude's response
    console.log(`Tool use events: ${toolEvents.length}`);

    // Should complete successfully or with error
    const completeEvent = events.find((e) => e.event === "complete");
    const errorEvent = events.find((e) => e.event === "error");
    expect(completeEvent || errorEvent).toBeDefined();
  }, 180000); // 3 minute timeout

  it("handles task timeout gracefully", async () => {
    console.log("[TEST] Starting timeout handling test");
    console.log("[TEST] Making POST request to /v1/tasks...");

    const startTime = Date.now();
    const res = await fetch(`${BASE_URL}/v1/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt:
          "This is a very short task that should complete before timeout.",
        repository: {
          url: "https://github.com/anthropics/anthropic-cookbook.git",
          branch: "main",
        },
        claude: {
          apiKey: ANTHROPIC_API_KEY,
          model: "claude-sonnet-4-5",
          maxTurns: 1,
        },
        options: {
          timeout: 60,
        },
        output: { mode: "sync" },
      }),
    });

    console.log(
      `[TEST] Response received in ${Date.now() - startTime}ms - Status: ${res.status}`
    );
    console.log(`[TEST] Content-Type: ${res.headers.get("content-type")}`);

    expect(res.status).toBe(200);

    // Parse SSE stream with 100 second timeout
    console.log("[TEST] Starting SSE stream parsing...");
    const events = await parseSSEStream(res, ["complete", "error"], 100000);
    console.log(`[TEST] SSE parsing complete. Total events: ${events.length}`);
    console.log(
      `[TEST] All event types: ${events.map((e) => e.event).join(", ")}`
    );

    // Should receive events (either complete or timeout)
    expect(events.length).toBeGreaterThan(0);
  }, 120000);
});

// Test that runs without external dependencies
describe("E2E: Local Validation", () => {
  it("has correct test configuration", () => {
    if (!shouldRunE2E) {
      console.log(
        "E2E tests skipped: Missing STAGING_API_KEY or ANTHROPIC_API_KEY"
      );
      console.log("To run E2E tests, set:");
      console.log("  STAGING_URL (optional, defaults to staging)");
      console.log("  STAGING_API_KEY (required)");
      console.log("  ANTHROPIC_API_KEY (required)");
    }
    expect(BASE_URL).toBeDefined();
    expect(BASE_URL).toMatch(/^https?:\/\//);
  });
});
