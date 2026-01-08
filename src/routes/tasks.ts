import { Hono } from "hono";
import { CreateTaskSchema, type CreateTaskInput } from "../schemas/task";
import { validateBody } from "../middleware/validate";
import type { Env, Task } from "../types";

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

  if (!c.env.ARTIFACTS) {
    return c.json({ error: { message: "Logs storage not configured" } }, 503);
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

  if (!c.env.ARTIFACTS) {
    return c.json({ error: { message: "Diff storage not configured" } }, 503);
  }

  const diff = await c.env.ARTIFACTS.get(`${taskId}/diff.patch`);

  if (!diff) {
    return c.json({ error: { message: "Diff not found" } }, 404);
  }

  return new Response(diff.body, {
    headers: { "Content-Type": "text/x-diff" },
  });
});
