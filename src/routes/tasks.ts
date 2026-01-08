import { Hono } from "hono";
import { CreateTaskSchema, type CreateTaskInput } from "../schemas/task";
import { validateBody } from "../middleware/validate";
import type { Env, Task, TaskQueueMessage } from "../types";

export const tasksRouter = new Hono<{ Bindings: Env }>();

tasksRouter.post("/", validateBody(CreateTaskSchema), async (c) => {
  const input = c.get("validatedBody") as CreateTaskInput;
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
  };

  await c.env.TASKS.put(taskId, JSON.stringify(task), {
    expirationTtl: 86400 * 7,
  });

  // Queue task for async processing if queue is available and mode is async
  const outputMode = input.output?.mode ?? "sync";
  if (outputMode === "async" && c.env.TASK_QUEUE) {
    const queueMessage: TaskQueueMessage = {
      taskId,
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
    202
  );
});

tasksRouter.get("/:id", async (c) => {
  const taskId = c.req.param("id");
  const task = await c.env.TASKS.get<Task>(taskId, "json");

  if (!task) {
    return c.json({ error: { message: "Task not found" } }, 404);
  }

  return c.json(task);
});

tasksRouter.post("/:id/cancel", async (c) => {
  const taskId = c.req.param("id");
  const task = await c.env.TASKS.get<Task>(taskId, "json");

  if (!task) {
    return c.json({ error: { message: "Task not found" } }, 404);
  }

  if (task.status !== "pending" && task.status !== "running") {
    return c.json({ error: { message: "Task cannot be cancelled" } }, 400);
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
    return c.json({ error: { message: "Task not found" } }, 404);
  }

  const logs = await c.env.ARTIFACTS.get(`${taskId}/logs.txt`);

  if (!logs) {
    return c.json({ error: { message: "Logs not found" } }, 404);
  }

  return new Response(logs.body, {
    headers: { "Content-Type": "text/plain" },
  });
});

tasksRouter.get("/:id/diff", async (c) => {
  const taskId = c.req.param("id");
  const task = await c.env.TASKS.get<Task>(taskId, "json");

  if (!task) {
    return c.json({ error: { message: "Task not found" } }, 404);
  }

  const diff = await c.env.ARTIFACTS.get(`${taskId}/diff.patch`);

  if (!diff) {
    return c.json({ error: { message: "Diff not found" } }, 404);
  }

  return new Response(diff.body, {
    headers: { "Content-Type": "text/x-diff" },
  });
});
