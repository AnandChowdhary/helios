import type { Env, Task, TaskQueueMessage, TaskResult } from "../types";
import {
  startContainerTask,
  getContainerState,
  getContainerResult,
  getContainerLogs,
} from "../container/runner";
import { decrementActiveTaskCount } from "../middleware/concurrentTaskLimit";
import { trackTaskCompleted } from "../services/usage";
import { StreamingLogManager } from "../utils/logs";

/**
 * Processes a queued task message by starting a container to execute Claude Code.
 *
 * Flow:
 * 1. Update task status to "running"
 * 2. Start container with task configuration
 * 3. Poll for container completion (with incremental log streaming to R2)
 * 4. Store results in R2 and update task status
 */
async function processQueuedTask(
  message: TaskQueueMessage,
  env: Env,
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

  // Use streaming log manager for incremental R2 uploads during execution
  const logManager = new StreamingLogManager(env, taskId, {
    flushIntervalMs: 5000, // Flush logs to R2 every 5 seconds
    maxBufferSize: 50, // Or when buffer reaches 50 entries
  });

  console.log(`Starting container for task ${taskId}`, {
    repository: message.repository.url,
    model: message.claude.model,
  });

  try {
    await startContainerTask(env, taskId, {
      prompt: message.prompt,
      repository: message.repository,
      claude: message.claude,
      options: message.options,
      gitToken: message.gitToken,
    });

    // Poll for completion with incremental log streaming
    const result = await pollForCompletion(
      env,
      taskId,
      message.options.timeout,
      logManager,
    );

    // Finalize logs - flushes remaining buffer and marks as complete
    await logManager.finalize();

    task.status = result.success ? "completed" : "failed";
    task.completedAt = new Date().toISOString();
    task.result = result;

    await env.TASKS.put(taskId, JSON.stringify(task), {
      expirationTtl: 86400 * 7,
    });

    // Store other artifacts (diff, result) - logs already stored via logManager
    await storeArtifacts(env, taskId, result);

    // Track task completion with usage data
    await trackTaskCompleted(env, message.apiKeyId, task);

    if (message.webhook) {
      await sendWebhook(message.webhook, task);
    }

    console.log(`Task ${taskId} completed`, {
      success: result.success,
      filesChanged: result.filesChanged?.length || 0,
    });

    // Decrement concurrent task counter on completion
    await decrementActiveTaskCount(env, message.apiKeyId);
  } catch (error) {
    task.status = "failed";
    task.completedAt = new Date().toISOString();
    task.error =
      error instanceof Error ? error.message : "Container execution failed";

    await env.TASKS.put(taskId, JSON.stringify(task), {
      expirationTtl: 86400 * 7,
    });

    // Store error log and finalize
    await logManager.addLog("error", task.error ?? "Unknown error");
    await logManager.finalize();

    // Track failed task
    await trackTaskCompleted(env, message.apiKeyId, task);

    if (message.webhook) {
      await sendWebhook(message.webhook, task);
    }

    // Decrement concurrent task counter on failure
    await decrementActiveTaskCount(env, message.apiKeyId);

    console.error(`Task ${taskId} failed:`, error);
    throw error;
  }
}

/**
 * Polls the container for completion and returns the result.
 * Uses exponential backoff with a maximum wait time based on task timeout.
 * Periodically streams logs to R2 for real-time access during execution.
 */
async function pollForCompletion(
  env: Env,
  taskId: string,
  timeoutSeconds: number,
  logManager: StreamingLogManager,
): Promise<TaskResult> {
  const startTime = Date.now();
  const maxWaitMs = timeoutSeconds * 1000;
  let pollInterval = 5000; // Start with 5 second intervals
  const maxPollInterval = 30000; // Max 30 second intervals
  let lastLogLength = 0;

  while (Date.now() - startTime < maxWaitMs) {
    const state = await getContainerState(env, taskId);

    // Fetch and stream new logs to R2 (best effort)
    try {
      const logs = await getContainerLogs(env, taskId);
      if (logs && logs.length > lastLogLength) {
        // Extract only new log content
        const newLogs = logs.slice(lastLogLength);
        if (newLogs.trim()) {
          // Split by newlines and add each as a log entry
          const logLines = newLogs.split("\n").filter((line) => line.trim());
          for (const line of logLines) {
            await logManager.addLog("container", line);
          }
        }
        lastLogLength = logs.length;
      }
    } catch {
      // Ignore log fetch errors during polling
    }

    if (state.status === "stopped_with_code") {
      const result = await getContainerResult(env, taskId);
      if (result) {
        return result;
      }
      return {
        success: false,
        summary: `Container exited with code ${state.exitCode ?? "unknown"}`,
        filesChanged: [],
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }

    if (state.status === "stopped") {
      const result = await getContainerResult(env, taskId);
      if (result) {
        return result;
      }

      return {
        success: false,
        summary: "Container stopped unexpectedly",
        filesChanged: [],
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }

    const result = await getContainerResult(env, taskId);
    if (result) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    pollInterval = Math.min(pollInterval * 1.5, maxPollInterval);
  }

  throw new Error(`Task timed out after ${timeoutSeconds} seconds`);
}

/**
 * Stores task artifacts (diff, result) in R2 storage.
 * Note: Logs are now handled separately by StreamingLogManager for incremental uploads.
 */
async function storeArtifacts(
  env: Env,
  taskId: string,
  result: TaskResult,
): Promise<void> {
  if (result.diff) {
    await env.ARTIFACTS.put(`${taskId}/diff.patch`, result.diff, {
      customMetadata: {
        taskId,
        createdAt: new Date().toISOString(),
      },
    });
  }

  await env.ARTIFACTS.put(`${taskId}/result.json`, JSON.stringify(result), {
    customMetadata: {
      taskId,
      createdAt: new Date().toISOString(),
    },
  });
}

/**
 * Configuration for webhook retry behavior.
 */
interface WebhookRetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number;
  /** Maximum delay between retries in ms (default: 10000) */
  maxDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: WebhookRetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 10000,
};

async function sendWebhook(
  webhook: { url: string; secret: string },
  task: Task,
  config: WebhookRetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<void> {
  const payload = JSON.stringify({
    event: task.status === "completed" ? "task.completed" : "task.failed",
    taskId: task.id,
    status: task.status,
    result: task.result,
    error: task.error,
    completedAt: task.completedAt,
  });

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(webhook.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  const signatureHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const headers = {
    "Content-Type": "application/json",
    "X-Helios-Signature": `sha256=${signatureHex}`,
    "X-Helios-Event":
      task.status === "completed" ? "task.completed" : "task.failed",
  };

  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt <= config.maxRetries) {
    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers,
        body: payload,
      });

      if (response.ok) {
        if (attempt > 0) {
          console.log(
            `Webhook delivered successfully to ${webhook.url} after ${attempt} ${attempt === 1 ? "retry" : "retries"}`,
          );
        }
        return;
      }

      const shouldRetry = isRetryableStatusCode(response.status);

      if (!shouldRetry) {
        console.warn(
          `Webhook delivery failed with status ${response.status} (non-retryable): ${webhook.url}`,
        );
        return;
      }

      lastError = new Error(`HTTP ${response.status}`);
      console.warn(
        `Webhook delivery attempt ${attempt + 1} failed with status ${response.status}: ${webhook.url}`,
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `Webhook delivery attempt ${attempt + 1} failed with error: ${lastError.message}`,
      );
    }

    attempt++;

    if (attempt <= config.maxRetries) {
      const delay = Math.min(
        config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelayMs,
      );
      await sleep(delay);
    }
  }

  console.error(
    `Webhook delivery failed after ${config.maxRetries + 1} attempts to ${webhook.url}: ${lastError?.message}`,
  );
}

function isRetryableStatusCode(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Queue consumer handler for processing async tasks.
 * Messages are processed one at a time (max_batch_size = 1 in wrangler.toml).
 */
export async function handleQueue(
  batch: MessageBatch<TaskQueueMessage>,
  env: Env,
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
