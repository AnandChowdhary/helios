import { Hono } from "hono";
import {
  getContainerLogStream,
  startContainerTask,
  stopContainerTask,
} from "../container/runner";
import { hashApiKey } from "../middleware/auth";
import {
  decrementActiveTaskCount,
  getActiveTaskCount,
  incrementActiveTaskCount,
} from "../middleware/concurrentTaskLimit";
import { CreateTaskSchema, type CreateTaskInput } from "../schemas/task";
import type {
  ApiKey,
  Env,
  Task,
  WebSocketClientMessage,
  WebSocketStreamMessage,
} from "../types";
import { errorResponse, ErrorCodes } from "../utils/errors";
import { storeLogsToR2, formatLogEntry } from "../utils/logs";

export const streamRouter = new Hono<{ Bindings: Env }>();

// Helper to create a WebSocket message
function createMessage(
  type: WebSocketStreamMessage["type"],
  taskId: string,
  data: Record<string, unknown>,
): string {
  const message: WebSocketStreamMessage = {
    type,
    taskId,
    data,
    timestamp: new Date().toISOString(),
  };
  return JSON.stringify(message);
}

// Helper to validate API key from various sources
async function validateApiKey(
  env: Env,
  request: Request,
): Promise<ApiKey | null> {
  // Try Authorization header first
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const keyHash = await hashApiKey(token);
    const keyData = await env.API_KEYS.get<ApiKey>(keyHash, "json");
    if (keyData?.enabled) return keyData;
  }

  // Try Sec-WebSocket-Protocol header (useful for browser WebSocket clients)
  const protocols = request.headers.get("Sec-WebSocket-Protocol");
  if (protocols) {
    // Format: "api-key, <actual-key>"
    const parts = protocols.split(",").map((p) => p.trim());
    if (parts.length >= 2 && parts[0] === "api-key") {
      const keyHash = await hashApiKey(parts[1]);
      const keyData = await env.API_KEYS.get<ApiKey>(keyHash, "json");
      if (keyData?.enabled) return keyData;
    }
  }

  // Try query parameter (useful for WebSocket clients that can't set headers)
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("api_key");
  if (queryToken) {
    const keyHash = await hashApiKey(queryToken);
    const keyData = await env.API_KEYS.get<ApiKey>(keyHash, "json");
    if (keyData?.enabled) return keyData;
  }

  return null;
}

// Check concurrent task limit
async function checkConcurrentLimit(
  env: Env,
  apiKey: ApiKey,
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const limit = apiKey.concurrentTaskLimit ?? 5;
  const current = await getActiveTaskCount(env, apiKey.id);
  return {
    allowed: current < limit,
    current,
    limit,
  };
}

/**
 * Process task execution and stream results via WebSocket.
 * This function handles the full lifecycle of a task: start, stream, cleanup.
 */
async function processTask(
  server: WebSocket,
  env: Env,
  apiKey: ApiKey,
  input: CreateTaskInput,
  taskId: string,
): Promise<void> {
  // Log buffer to collect logs for R2 storage
  const logBuffer: string[] = [];
  let logsStoredToR2 = false;

  const task: Task = {
    id: taskId,
    status: "pending",
    prompt: input.prompt,
    repository: {
      url: input.repository.url,
      branch: input.repository.branch,
    },
    createdAt: new Date().toISOString(),
    apiKeyId: apiKey.id,
  };

  // Increment concurrent task counter
  await incrementActiveTaskCount(env, apiKey.id);

  await env.TASKS.put(taskId, JSON.stringify(task), {
    expirationTtl: 86400 * 7,
  });

  server.send(
    createMessage("status", taskId, {
      status: "pending",
      message: "Task created",
    }),
  );

  try {
    // Update task status to running
    task.status = "running";
    task.startedAt = new Date().toISOString();
    await env.TASKS.put(taskId, JSON.stringify(task));

    server.send(
      createMessage("status", taskId, {
        status: "starting",
        message: "Starting container...",
      }),
    );

    // Start the container
    await startContainerTask(env, taskId, {
      prompt: input.prompt,
      repository: {
        url: input.repository.url,
        branch: input.repository.branch,
      },
      claude: {
        apiKey: input.claude.apiKey,
        model: input.claude.model ?? "claude-sonnet-4-5",
        maxTurns: input.claude.maxTurns ?? 10,
        systemPrompt: input.claude.systemPrompt,
      },
      options: {
        timeout: input.options?.timeout ?? 300,
      },
      gitToken: input.repository.credentials?.value,
    });

    server.send(
      createMessage("status", taskId, {
        status: "running",
        message: "Task is running...",
      }),
    );

    // Get the log stream from the container
    const logResponse = await getContainerLogStream(env, taskId);

    if (logResponse && logResponse.body) {
      const reader = logResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "message";

      // Helper function to process SSE lines
      const processLine = async (line: string) => {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const eventData = line.slice(6);

          // Capture log entry (skip heartbeats)
          if (currentEvent !== "heartbeat") {
            logBuffer.push(formatLogEntry(currentEvent, eventData));
          }

          // Forward message via WebSocket
          try {
            const parsedData = JSON.parse(eventData);
            server.send(
              createMessage(
                currentEvent as WebSocketStreamMessage["type"],
                taskId,
                parsedData,
              ),
            );

            // If we got a complete event, update task
            if (currentEvent === "complete") {
              task.status = parsedData.success ? "completed" : "failed";
              task.completedAt = new Date().toISOString();
              task.result = parsedData;
              await env.TASKS.put(taskId, JSON.stringify(task));

              // Store artifacts (diff)
              if (parsedData.diff) {
                await env.ARTIFACTS.put(
                  `${taskId}/diff.patch`,
                  parsedData.diff,
                );
              }

              // Store logs to R2
              if (logBuffer.length > 0) {
                await storeLogsToR2(env, taskId, logBuffer);
                logsStoredToR2 = true;
              }
            }
          } catch {
            // If data is not JSON, send as-is
            server.send(
              createMessage(
                currentEvent as WebSocketStreamMessage["type"],
                taskId,
                { raw: eventData },
              ),
            );
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from the container response
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          await processLine(line);
        }
      }

      // Process any remaining content in buffer after stream ends
      if (buffer.trim()) {
        const remainingLines = buffer.split("\n");
        for (const line of remainingLines) {
          await processLine(line);
        }
      }

      // Store logs if not already stored (stream ended without 'complete' event)
      if (logBuffer.length > 0 && !logsStoredToR2) {
        await storeLogsToR2(env, taskId, logBuffer);
      }
    } else {
      // Container didn't return a stream
      server.send(
        createMessage("error", taskId, {
          code: ErrorCodes.STREAM_ERROR,
          message: "Failed to connect to container log stream",
        }),
      );

      task.status = "failed";
      task.error = "Failed to connect to container log stream";
      task.completedAt = new Date().toISOString();
      await env.TASKS.put(taskId, JSON.stringify(task));

      // Store error log to R2
      await storeLogsToR2(
        env,
        taskId,
        formatLogEntry("error", "Failed to connect to container log stream"),
      );
    }

    // Stop the container after streaming is complete
    try {
      await stopContainerTask(env, taskId);
    } catch {
      // Container may already be stopped
    }

    // Decrement concurrent task counter
    await decrementActiveTaskCount(env, apiKey.id);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    server.send(
      createMessage("error", taskId, {
        code: ErrorCodes.TASK_EXECUTION_FAILED,
        message: errorMessage,
      }),
    );

    task.status = "failed";
    task.error = errorMessage;
    task.completedAt = new Date().toISOString();
    await env.TASKS.put(taskId, JSON.stringify(task));

    // Store logs to R2 (including error)
    logBuffer.push(formatLogEntry("error", errorMessage));
    if (logBuffer.length > 0) {
      await storeLogsToR2(env, taskId, logBuffer);
    }

    // Try to stop container on error
    try {
      await stopContainerTask(env, taskId);
    } catch {
      // Ignore
    }

    // Decrement concurrent task counter on error
    await decrementActiveTaskCount(env, apiKey.id);
  }
}

/**
 * WebSocket endpoint for streaming task creation and execution.
 *
 * Usage:
 * 1. Connect to GET /v1/tasks/stream with Authorization header, api_key query param,
 *    or Sec-WebSocket-Protocol: api-key, <your-key>
 * 2. Send task configuration as JSON message
 * 3. Receive streaming updates until completion
 *
 * Client messages:
 * - Task config: { prompt, repository, claude, options }
 * - Cancel: { command: "cancel", taskId: "xxx" }
 * - Ping: { command: "ping" }
 *
 * Server messages:
 * - { type: "connected", taskId: "", data: { message: "..." }, timestamp: "..." }
 * - { type: "status", taskId: "xxx", data: { status: "running" }, timestamp: "..." }
 * - { type: "message", taskId: "xxx", data: { content: "..." }, timestamp: "..." }
 * - { type: "complete", taskId: "xxx", data: { result: {...} }, timestamp: "..." }
 * - { type: "error", taskId: "xxx", data: { code: "...", message: "..." }, timestamp: "..." }
 */
streamRouter.get("/", async (c) => {
  const env = c.env;
  const request = c.req.raw;

  // Check if this is a WebSocket upgrade request
  const upgradeHeader = request.headers.get("Upgrade");
  if (upgradeHeader?.toLowerCase() !== "websocket") {
    return c.json(
      errorResponse(
        ErrorCodes.STREAM_UPGRADE_REQUIRED,
        "Expected WebSocket upgrade request. Include Upgrade: websocket header.",
      ),
      426,
    );
  }

  // Validate API key before upgrade
  const apiKey = await validateApiKey(env, request);
  if (!apiKey) {
    return c.json(
      errorResponse(
        ErrorCodes.AUTH_INVALID_KEY,
        "Invalid or missing API key. Provide via Authorization header, api_key query parameter, or Sec-WebSocket-Protocol: api-key, <your-key>",
      ),
      401,
    );
  }

  // Create WebSocket pair
  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  // State for this connection
  let currentTaskId: string | null = null;
  let taskStarted = false;

  // Accept the WebSocket connection
  server.accept();

  // Send welcome message
  server.send(
    createMessage("connected", "", {
      message:
        "Connected to Helios WebSocket. Send task configuration to begin.",
    }),
  );

  // Handle messages
  server.addEventListener("message", async (event) => {
    const rawData =
      typeof event.data === "string"
        ? event.data
        : event.data instanceof ArrayBuffer
          ? new TextDecoder().decode(event.data)
          : "";

    let data: CreateTaskInput | WebSocketClientMessage;
    try {
      data = JSON.parse(rawData);
    } catch {
      server.send(
        createMessage("error", currentTaskId || "", {
          code: ErrorCodes.STREAM_INVALID_JSON,
          message: "Invalid JSON message",
        }),
      );
      return;
    }

    // Handle client commands
    if ("command" in data) {
      const cmd = data as WebSocketClientMessage;
      if (cmd.command === "ping") {
        server.send(
          createMessage("status", currentTaskId || "", {
            status: "pong",
          }),
        );
        return;
      }

      if (cmd.command === "cancel" && currentTaskId) {
        try {
          await stopContainerTask(env, currentTaskId);
          const task = await env.TASKS.get<Task>(currentTaskId, "json");
          if (task) {
            task.status = "cancelled";
            task.completedAt = new Date().toISOString();
            await env.TASKS.put(currentTaskId, JSON.stringify(task));
          }
          await decrementActiveTaskCount(env, apiKey.id);
          server.send(
            createMessage("status", currentTaskId, {
              status: "cancelled",
            }),
          );
          currentTaskId = null;
          taskStarted = false;
        } catch {
          server.send(
            createMessage("error", currentTaskId || "", {
              code: ErrorCodes.TASK_NOT_CANCELLABLE,
              message: "Failed to cancel task",
            }),
          );
        }
        return;
      }

      return;
    }

    // Don't allow starting a new task if one is already running
    if (taskStarted) {
      server.send(
        createMessage("error", currentTaskId || "", {
          code: ErrorCodes.STREAM_TASK_RUNNING,
          message:
            "A task is already running on this connection. Wait for it to complete or send a cancel command.",
        }),
      );
      return;
    }

    // Validate task configuration
    const parseResult = CreateTaskSchema.safeParse(data);
    if (!parseResult.success) {
      server.send(
        createMessage("error", "", {
          code: ErrorCodes.STREAM_VALIDATION_FAILED,
          message: "Invalid task configuration",
          errors: parseResult.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        }),
      );
      return;
    }

    const input = parseResult.data;

    // Check concurrent task limit
    const limitCheck = await checkConcurrentLimit(env, apiKey);
    if (!limitCheck.allowed) {
      server.send(
        createMessage("error", "", {
          code: ErrorCodes.CONCURRENT_LIMIT_EXCEEDED,
          message: `Concurrent task limit exceeded. You have ${limitCheck.current} active tasks (limit: ${limitCheck.limit}).`,
          current: limitCheck.current,
          limit: limitCheck.limit,
        }),
      );
      return;
    }

    // Create task
    const taskId = crypto.randomUUID();
    currentTaskId = taskId;
    taskStarted = true;

    // Process task in the background (but don't await - let it stream)
    processTask(server, env, apiKey, input, taskId)
      .then(() => {
        taskStarted = false;
      })
      .catch(() => {
        taskStarted = false;
      });
  });

  // Handle close
  server.addEventListener("close", async () => {
    // If task was still running when connection closed, clean up
    if (taskStarted && currentTaskId) {
      try {
        const task = await env.TASKS.get<Task>(currentTaskId, "json");
        if (task && (task.status === "pending" || task.status === "running")) {
          task.status = "cancelled";
          task.error = "WebSocket connection closed";
          task.completedAt = new Date().toISOString();
          await env.TASKS.put(currentTaskId, JSON.stringify(task));
        }
        await stopContainerTask(env, currentTaskId);
      } catch {
        // Best effort cleanup
      }
      await decrementActiveTaskCount(env, apiKey.id);
    }
  });

  // Handle error
  server.addEventListener("error", async () => {
    // Clean up on error
    if (taskStarted && currentTaskId) {
      try {
        await stopContainerTask(env, currentTaskId);
      } catch {
        // Best effort cleanup
      }
      await decrementActiveTaskCount(env, apiKey.id);
    }
  });

  // Return response with WebSocket
  return new Response(null, {
    status: 101,
    webSocket: client,
  });
});

// Export helper for testing
export { checkConcurrentLimit, createMessage, validateApiKey };
