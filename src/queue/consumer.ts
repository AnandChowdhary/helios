import type { Env, Task, TaskQueueMessage } from "../types";

/**
 * Processes a queued task message by updating its status and preparing for container execution.
 * Container execution will be implemented when Cloudflare Containers integration is ready.
 */
async function processQueuedTask(
  message: TaskQueueMessage,
  env: Env
): Promise<void> {
  const { taskId } = message;

  const task = await env.TASKS.get<Task>(taskId, "json");
  if (!task) {
    console.error(`Task ${taskId} not found in KV`);
    return;
  }

  task.status = "running";
  task.startedAt = new Date().toISOString();
  await env.TASKS.put(taskId, JSON.stringify(task), {
    expirationTtl: 86400 * 7,
  });

  try {
    console.log(`Task ${taskId} queued for processing`, {
      repository: message.repository.url,
      model: message.claude.model,
    });
  } catch (error) {
    task.status = "failed";
    task.error = error instanceof Error ? error.message : "Unknown error";
    task.completedAt = new Date().toISOString();
    await env.TASKS.put(taskId, JSON.stringify(task), {
      expirationTtl: 86400 * 7,
    });

    console.error(`Task ${taskId} failed:`, error);
  }
}

/**
 * Queue consumer handler for processing async tasks.
 * Messages are processed one at a time (max_batch_size = 1 in wrangler.toml).
 */
export async function handleQueue(
  batch: MessageBatch<TaskQueueMessage>,
  env: Env
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await processQueuedTask(message.body, env);
      message.ack();
    } catch (error) {
      console.error("Failed to process queue message:", error);
      message.retry();
    }
  }
}
