import type { Env, Task, TaskIndex, TaskListResponse } from "../types";

const MAX_INDEX_SIZE = 1000; // Maximum number of task IDs to store per API key
const INDEX_EXPIRATION_TTL = 86400 * 30; // 30 days

/**
 * Get the KV key for an API key's task index
 */
function getIndexKey(apiKeyId: string): string {
  return `index:${apiKeyId}`;
}

/**
 * Add a task ID to the API key's task index
 * Tasks are stored in reverse chronological order (newest first)
 */
export async function addTaskToIndex(
  env: Env,
  apiKeyId: string,
  taskId: string,
): Promise<void> {
  const indexKey = getIndexKey(apiKeyId);
  const existing = await env.TASKS.get<TaskIndex>(indexKey, "json");

  const index: TaskIndex = existing ?? {
    apiKeyId,
    taskIds: [],
    updatedAt: new Date().toISOString(),
  };

  // Add new task ID at the beginning (newest first)
  index.taskIds.unshift(taskId);

  // Trim to max size to prevent unbounded growth
  if (index.taskIds.length > MAX_INDEX_SIZE) {
    index.taskIds = index.taskIds.slice(0, MAX_INDEX_SIZE);
  }

  index.updatedAt = new Date().toISOString();

  await env.TASKS.put(indexKey, JSON.stringify(index), {
    expirationTtl: INDEX_EXPIRATION_TTL,
  });
}

/**
 * Remove a task ID from the API key's task index
 * Used when a task is deleted or expired
 */
export async function removeTaskFromIndex(
  env: Env,
  apiKeyId: string,
  taskId: string,
): Promise<void> {
  const indexKey = getIndexKey(apiKeyId);
  const existing = await env.TASKS.get<TaskIndex>(indexKey, "json");

  if (!existing) {
    return;
  }

  existing.taskIds = existing.taskIds.filter((id) => id !== taskId);
  existing.updatedAt = new Date().toISOString();

  await env.TASKS.put(indexKey, JSON.stringify(existing), {
    expirationTtl: INDEX_EXPIRATION_TTL,
  });
}

/**
 * List tasks for an API key with pagination and optional status filter
 */
export async function listTasks(
  env: Env,
  apiKeyId: string,
  options: {
    limit?: number;
    offset?: number;
    status?: Task["status"];
  } = {},
): Promise<TaskListResponse> {
  const { limit = 20, offset = 0, status } = options;

  // Clamp limit to reasonable bounds
  const effectiveLimit = Math.min(Math.max(1, limit), 100);
  const effectiveOffset = Math.max(0, offset);

  const indexKey = getIndexKey(apiKeyId);
  const index = await env.TASKS.get<TaskIndex>(indexKey, "json");

  if (!index || index.taskIds.length === 0) {
    return {
      tasks: [],
      pagination: {
        total: 0,
        limit: effectiveLimit,
        offset: effectiveOffset,
        hasMore: false,
      },
    };
  }

  // Fetch all tasks to apply status filter if needed
  // This is not ideal for large datasets but works for MVP
  const allTaskIds = index.taskIds;
  const tasks: Task[] = [];
  const validTaskIds: string[] = [];

  // Fetch tasks in batches for efficiency
  const batchSize = 50;
  for (let i = 0; i < allTaskIds.length; i += batchSize) {
    const batch = allTaskIds.slice(i, i + batchSize);
    const taskPromises = batch.map((id) => env.TASKS.get<Task>(id, "json"));
    const batchResults = await Promise.all(taskPromises);

    for (let j = 0; j < batchResults.length; j++) {
      const task = batchResults[j];
      if (task) {
        validTaskIds.push(allTaskIds[i + j]);
        // Apply status filter if specified
        if (!status || task.status === status) {
          tasks.push(task);
        }
      }
    }
  }

  // Clean up index if we found invalid task IDs (tasks that no longer exist)
  if (validTaskIds.length !== allTaskIds.length) {
    const updatedIndex: TaskIndex = {
      apiKeyId,
      taskIds: validTaskIds,
      updatedAt: new Date().toISOString(),
    };
    await env.TASKS.put(indexKey, JSON.stringify(updatedIndex), {
      expirationTtl: INDEX_EXPIRATION_TTL,
    });
  }

  // Apply pagination
  const total = tasks.length;
  const paginatedTasks = tasks.slice(
    effectiveOffset,
    effectiveOffset + effectiveLimit,
  );
  const hasMore = effectiveOffset + paginatedTasks.length < total;

  return {
    tasks: paginatedTasks,
    pagination: {
      total,
      limit: effectiveLimit,
      offset: effectiveOffset,
      hasMore,
    },
  };
}
