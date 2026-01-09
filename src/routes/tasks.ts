import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  CreateTaskSchema,
  PushTaskSchema,
  type CreateTaskInput,
  type PushTaskInput,
} from "../schemas/task";
import { validateBody } from "../middleware/validate";
import type { Env, Task, TaskQueueMessage, ApiKey } from "../types";
import {
  startContainerTask,
  getContainerLogStream,
  stopContainerTask,
  pushContainerChanges,
} from "../container/runner";
import {
  concurrentTaskLimitMiddleware,
  incrementActiveTaskCount,
  decrementActiveTaskCount,
} from "../middleware/concurrentTaskLimit";
import {
  trackRequest,
  trackTaskCreated,
  trackTaskCompleted,
} from "../services/usage";
import { addTaskToIndex, listTasks } from "../services/taskIndex";
import { errorResponse, ErrorCodes } from "../utils/errors";

export const tasksRouter = new Hono<{ Bindings: Env }>();

// GET /v1/tasks - List tasks for the authenticated API key
tasksRouter.get("/", async (c) => {
  const apiKey = c.get("apiKey") as ApiKey;

  // Parse query parameters
  const limitParam = c.req.query("limit");
  const offsetParam = c.req.query("offset");
  const statusParam = c.req.query("status");

  const limit = limitParam ? parseInt(limitParam, 10) : 20;
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

  // Validate status parameter if provided
  const validStatuses = [
    "pending",
    "running",
    "completed",
    "failed",
    "cancelled",
  ] as const;
  let status: (typeof validStatuses)[number] | undefined;

  if (statusParam) {
    if (
      !validStatuses.includes(statusParam as (typeof validStatuses)[number])
    ) {
      return c.json(
        errorResponse(
          ErrorCodes.VALIDATION_INVALID_PARAM,
          `Invalid status filter. Must be one of: ${validStatuses.join(", ")}`,
          { parameter: "status", value: statusParam },
        ),
        400,
      );
    }
    status = statusParam as (typeof validStatuses)[number];
  }

  // Validate limit and offset
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return c.json(
      errorResponse(
        ErrorCodes.VALIDATION_INVALID_PARAM,
        "limit must be a number between 1 and 100",
        { parameter: "limit", value: limitParam },
      ),
      400,
    );
  }

  if (isNaN(offset) || offset < 0) {
    return c.json(
      errorResponse(
        ErrorCodes.VALIDATION_INVALID_PARAM,
        "offset must be a non-negative number",
        { parameter: "offset", value: offsetParam },
      ),
      400,
    );
  }

  const result = await listTasks(c.env, apiKey.id, { limit, offset, status });
  return c.json(result);
});

tasksRouter.post(
  "/",
  concurrentTaskLimitMiddleware,
  validateBody(CreateTaskSchema),
  async (c) => {
    const input = c.get("validatedBody") as CreateTaskInput;
    const apiKey = c.get("apiKey") as ApiKey;
    const taskId = crypto.randomUUID();

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
    await incrementActiveTaskCount(c.env, apiKey.id);

    // Track request and task creation
    await trackRequest(c.env, apiKey.id);
    await trackTaskCreated(c.env, apiKey.id);

    await c.env.TASKS.put(taskId, JSON.stringify(task), {
      expirationTtl: 86400 * 7,
    });

    // Add task to the API key's task index for listing
    await addTaskToIndex(c.env, apiKey.id, taskId);

    const outputMode = input.output?.mode ?? "sync";

    // Async mode: queue task and return immediately
    if (outputMode === "async") {
      if (c.env.TASK_QUEUE) {
        const queueMessage: TaskQueueMessage = {
          taskId,
          apiKeyId: apiKey.id,
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
            allowedTools: input.options?.allowedTools ?? [
              "Read",
              "Write",
              "Bash",
              "Glob",
              "Grep",
            ],
            workingDirectory: input.options?.workingDirectory ?? "/workspace",
            environment: input.options?.environment,
          },
          webhook: input.output?.webhook,
          gitToken: input.repository.credentials?.value,
        };

        await c.env.TASK_QUEUE.send(queueMessage);
      }

      return c.json(
        {
          taskId,
          status: "pending",
          createdAt: task.createdAt,
          statusUrl: `${new URL(c.req.url).origin}/v1/tasks/${taskId}`,
        },
        202,
      );
    }

    // Sync mode: start container and stream SSE response
    return streamSSE(c, async (stream) => {
      try {
        // Update task status to running
        task.status = "running";
        task.startedAt = new Date().toISOString();
        await c.env.TASKS.put(taskId, JSON.stringify(task));

        // Send initial status
        await stream.writeSSE({
          event: "status",
          data: JSON.stringify({ status: "starting", taskId }),
        });

        // Start the container
        await startContainerTask(c.env, taskId, {
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

        await stream.writeSSE({
          event: "status",
          data: JSON.stringify({ status: "running", taskId }),
        });

        // Get the log stream from the container
        const logResponse = await getContainerLogStream(c.env, taskId);

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
              const data = line.slice(6);
              await stream.writeSSE({
                event: currentEvent,
                data,
              });

              // If we got a complete event, update task and stop streaming
              if (currentEvent === "complete") {
                try {
                  const result = JSON.parse(data);
                  task.status = result.success ? "completed" : "failed";
                  task.completedAt = new Date().toISOString();
                  task.result = result;
                  await c.env.TASKS.put(taskId, JSON.stringify(task));

                  // Track task completion with usage data
                  await trackTaskCompleted(c.env, apiKey.id, task);

                  // Store artifacts
                  if (result.diff) {
                    await c.env.ARTIFACTS.put(
                      `${taskId}/diff.patch`,
                      result.diff,
                    );
                  }
                } catch {
                  // Ignore parse errors
                }
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
        } else {
          // Fallback: container didn't return a stream
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({
              code: ErrorCodes.STREAM_ERROR,
              message: "Failed to connect to container log stream",
            }),
          });

          task.status = "failed";
          task.error = "Failed to connect to container log stream";
          task.completedAt = new Date().toISOString();
          await c.env.TASKS.put(taskId, JSON.stringify(task));

          // Track failed task
          await trackTaskCompleted(c.env, apiKey.id, task);

          // Decrement concurrent task counter on stream failure
          await decrementActiveTaskCount(c.env, apiKey.id);
        }

        // Stop the container after streaming is complete
        try {
          await stopContainerTask(c.env, taskId);
        } catch {
          // Container may already be stopped
        }

        // Decrement concurrent task counter when task completes
        await decrementActiveTaskCount(c.env, apiKey.id);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            code: ErrorCodes.TASK_EXECUTION_FAILED,
            message: errorMessage,
          }),
        });

        task.status = "failed";
        task.error = errorMessage;
        task.completedAt = new Date().toISOString();
        await c.env.TASKS.put(taskId, JSON.stringify(task));

        // Track failed task
        await trackTaskCompleted(c.env, apiKey.id, task);

        // Try to stop container on error
        try {
          await stopContainerTask(c.env, taskId);
        } catch {
          // Ignore
        }

        // Decrement concurrent task counter on error
        await decrementActiveTaskCount(c.env, apiKey.id);
      }
    });
  },
);

tasksRouter.get("/:id", async (c) => {
  const taskId = c.req.param("id");
  const task = await c.env.TASKS.get<Task>(taskId, "json");

  if (!task) {
    return c.json(errorResponse(ErrorCodes.TASK_NOT_FOUND), 404);
  }

  return c.json(task);
});

tasksRouter.post("/:id/cancel", async (c) => {
  const taskId = c.req.param("id");
  const task = await c.env.TASKS.get<Task>(taskId, "json");

  if (!task) {
    return c.json(errorResponse(ErrorCodes.TASK_NOT_FOUND), 404);
  }

  if (task.status !== "pending" && task.status !== "running") {
    return c.json(
      errorResponse(
        ErrorCodes.TASK_NOT_CANCELLABLE,
        `Task cannot be cancelled. Current status: ${task.status}`,
        { currentStatus: task.status },
      ),
      400,
    );
  }

  task.status = "cancelled";
  task.completedAt = new Date().toISOString();
  await c.env.TASKS.put(taskId, JSON.stringify(task));

  return c.json({
    taskId,
    status: "cancelled",
    cancelledAt: task.completedAt,
  });
});

tasksRouter.get("/:id/logs", async (c) => {
  const taskId = c.req.param("id");
  const task = await c.env.TASKS.get<Task>(taskId, "json");

  if (!task) {
    return c.json(errorResponse(ErrorCodes.TASK_NOT_FOUND), 404);
  }

  const logs = await c.env.ARTIFACTS.get(`${taskId}/logs.txt`);

  if (!logs) {
    return c.json(errorResponse(ErrorCodes.LOGS_NOT_FOUND), 404);
  }

  return new Response(logs.body, {
    headers: { "Content-Type": "text/plain" },
  });
});

tasksRouter.get("/:id/diff", async (c) => {
  const taskId = c.req.param("id");
  const task = await c.env.TASKS.get<Task>(taskId, "json");

  if (!task) {
    return c.json(errorResponse(ErrorCodes.TASK_NOT_FOUND), 404);
  }

  const diff = await c.env.ARTIFACTS.get(`${taskId}/diff.patch`);

  if (!diff) {
    return c.json(errorResponse(ErrorCodes.DIFF_NOT_FOUND), 404);
  }

  return new Response(diff.body, {
    headers: { "Content-Type": "text/x-diff" },
  });
});

tasksRouter.post("/:id/push", validateBody(PushTaskSchema), async (c) => {
  const taskId = c.req.param("id");
  const input = c.get("validatedBody") as PushTaskInput;

  const task = await c.env.TASKS.get<Task>(taskId, "json");

  if (!task) {
    return c.json(errorResponse(ErrorCodes.TASK_NOT_FOUND), 404);
  }

  // Only allow push for completed tasks
  if (task.status !== "completed") {
    return c.json(
      errorResponse(
        ErrorCodes.PUSH_NOT_COMPLETED,
        `Cannot push changes for task with status: ${task.status}. Task must be completed first.`,
        { currentStatus: task.status },
      ),
      400,
    );
  }

  // Call the container to push changes
  const result = await pushContainerChanges(c.env, taskId, {
    branch: input.branch,
    credentials: input.credentials,
    createPR: input.createPR,
    prTitle: input.prTitle,
    prBody: input.prBody,
  });

  if (!result.success) {
    return c.json(
      {
        ...errorResponse(ErrorCodes.PUSH_FAILED, result.error),
        taskId,
        success: false,
      },
      500,
    );
  }

  return c.json({
    taskId,
    success: true,
    branch: result.branch,
    message: result.message,
    pullRequest: result.pullRequest,
    pullRequestError: result.pullRequestError,
  });
});
