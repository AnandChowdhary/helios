import type {
  HeliosConfig,
  CreateTaskInput,
  CreateAsyncTaskInput,
  CreateStreamTaskInput,
  Task,
  AsyncTaskResponse,
  CancelTaskResponse,
  PushTaskInput,
  PushTaskResponse,
  SSEEvent,
  APIError,
  ListTasksOptions,
  TaskListResponse,
  RetryConfig,
} from "./types.js";

const DEFAULT_BASE_URL = "https://helios.getelysium.workers.dev";

/** Default retry configuration */
const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryOnRateLimit: true,
};

/**
 * Error thrown by the Helios SDK
 */
export class HeliosError extends Error {
  /** Whether this error is retryable */
  public readonly retryable: boolean;

  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "HeliosError";
    // 5xx errors and rate limits are retryable
    this.retryable =
      status === undefined ||
      status >= 500 ||
      status === 429;
  }
}

/**
 * Check if a status code is retryable
 */
function isRetryableStatus(status: number, retryOnRateLimit: boolean): boolean {
  if (status >= 500) return true;
  if (status === 429 && retryOnRateLimit) return true;
  return false;
}

/**
 * Calculate delay for exponential backoff with jitter
 */
function calculateBackoffDelay(
  attempt: number,
  config: Required<RetryConfig>,
): number {
  const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const delay = Math.min(baseDelay, config.maxDelayMs);
  // Add jitter (±10%)
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helios SDK client for interacting with the Cloud Claude Code API
 */
export class HeliosClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly retryConfig: Required<RetryConfig> | null;

  /**
   * Create a new Helios client
   * @param config - Client configuration
   */
  constructor(config: HeliosConfig) {
    if (!config.apiKey) {
      throw new HeliosError("API key is required");
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");

    // Configure retry behavior
    if (config.retry === false) {
      this.retryConfig = null;
    } else {
      this.retryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        ...config.retry,
      };
    }
  }

  /**
   * Extract error message and code from a failed response
   */
  private async extractError(
    response: Response,
  ): Promise<{ message: string; code?: string }> {
    let errorMessage = `Request failed with status ${response.status}`;
    let errorCode: string | undefined;
    try {
      const errorData = (await response.json()) as APIError & {
        error?: { code?: string };
      };
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      }
      if (errorData.error?.code) {
        errorCode = errorData.error.code;
      }
    } catch {
      // Use default error message
    }
    return { message: errorMessage, code: errorCode };
  }

  /**
   * Make an authenticated request to the API with retry support
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    let lastError: HeliosError | undefined;
    const maxAttempts = this.retryConfig
      ? this.retryConfig.maxRetries + 1
      : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
          const { message, code } = await this.extractError(response);
          const error = new HeliosError(message, response.status, code);

          // Check if we should retry
          if (
            this.retryConfig &&
            attempt < this.retryConfig.maxRetries &&
            isRetryableStatus(
              response.status,
              this.retryConfig.retryOnRateLimit,
            )
          ) {
            lastError = error;
            const delay = calculateBackoffDelay(attempt, this.retryConfig);
            await sleep(delay);
            continue;
          }

          throw error;
        }

        return response.json() as Promise<T>;
      } catch (error) {
        // Network errors are retryable
        if (
          error instanceof TypeError &&
          this.retryConfig &&
          attempt < this.retryConfig.maxRetries
        ) {
          lastError = new HeliosError(
            error.message || "Network error",
            undefined,
            "NETWORK_ERROR",
          );
          const delay = calculateBackoffDelay(attempt, this.retryConfig);
          await sleep(delay);
          continue;
        }

        // Re-throw HeliosError as-is
        if (error instanceof HeliosError) {
          throw error;
        }

        // Wrap other errors
        throw new HeliosError(
          error instanceof Error ? error.message : "Unknown error",
          undefined,
          "UNKNOWN_ERROR",
        );
      }
    }

    // If we exhausted all retries, throw the last error
    throw lastError || new HeliosError("Request failed after retries");
  }

  /**
   * Make an authenticated request that returns text with retry support
   */
  private async requestText(path: string): Promise<string> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
    };

    let lastError: HeliosError | undefined;
    const maxAttempts = this.retryConfig
      ? this.retryConfig.maxRetries + 1
      : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(url, { headers });

        if (!response.ok) {
          const { message, code } = await this.extractError(response);
          const error = new HeliosError(message, response.status, code);

          if (
            this.retryConfig &&
            attempt < this.retryConfig.maxRetries &&
            isRetryableStatus(
              response.status,
              this.retryConfig.retryOnRateLimit,
            )
          ) {
            lastError = error;
            const delay = calculateBackoffDelay(attempt, this.retryConfig);
            await sleep(delay);
            continue;
          }

          throw error;
        }

        return response.text();
      } catch (error) {
        if (
          error instanceof TypeError &&
          this.retryConfig &&
          attempt < this.retryConfig.maxRetries
        ) {
          lastError = new HeliosError(
            error.message || "Network error",
            undefined,
            "NETWORK_ERROR",
          );
          const delay = calculateBackoffDelay(attempt, this.retryConfig);
          await sleep(delay);
          continue;
        }

        if (error instanceof HeliosError) {
          throw error;
        }

        throw new HeliosError(
          error instanceof Error ? error.message : "Unknown error",
          undefined,
          "UNKNOWN_ERROR",
        );
      }
    }

    throw lastError || new HeliosError("Request failed after retries");
  }

  /**
   * Parse SSE lines and yield events
   */
  private *parseSSELines(lines: string[]): Generator<SSEEvent> {
    let currentEvent = "message";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const data = line.slice(6);
        try {
          yield {
            event: currentEvent as SSEEvent["event"],
            data: JSON.parse(data),
          };
        } catch {
          yield {
            event: currentEvent as SSEEvent["event"],
            data,
          };
        }
      }
    }
  }

  /**
   * Create and run a task asynchronously
   *
   * The task will be queued and processed in the background.
   * Use `getTask()` to check status or configure a webhook to receive notifications.
   *
   * @param input - Task configuration
   * @returns Task ID and status URL
   *
   * @example
   * ```typescript
   * const response = await client.createTaskAsync({
   *   prompt: "Fix the failing tests",
   *   repository: {
   *     url: "https://github.com/user/repo.git",
   *     credentials: { type: "token", value: "ghp_xxx" }
   *   },
   *   claude: {
   *     apiKey: "sk-ant-xxx"
   *   }
   * });
   * console.log(`Task created: ${response.taskId}`);
   * ```
   */
  async createTaskAsync(
    input: CreateAsyncTaskInput,
  ): Promise<AsyncTaskResponse> {
    const { webhook, ...rest } = input;
    const payload: CreateTaskInput = {
      ...rest,
      output: {
        mode: "async",
        webhook,
      },
    };
    return this.request<AsyncTaskResponse>("POST", "/v1/tasks", payload);
  }

  /**
   * Create and run a task synchronously with SSE streaming
   *
   * Returns an async iterator that yields events as the task executes.
   *
   * @param input - Task configuration
   * @returns Async iterator of SSE events
   *
   * @example
   * ```typescript
   * const events = client.createTaskStream({
   *   prompt: "Add a README file",
   *   repository: { url: "https://github.com/user/repo.git" },
   *   claude: { apiKey: "sk-ant-xxx" }
   * });
   *
   * for await (const event of events) {
   *   console.log(event.event, event.data);
   * }
   * ```
   */
  async *createTaskStream(
    input: CreateStreamTaskInput,
  ): AsyncGenerator<SSEEvent, void, unknown> {
    const payload: CreateTaskInput = {
      ...input,
      output: { mode: "sync" },
    };

    const url = `${this.baseUrl}/v1/tasks`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const { message, code } = await this.extractError(response);
      throw new HeliosError(message, response.status, code);
    }

    if (!response.body) {
      throw new HeliosError("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        yield* this.parseSSELines(lines);
      }

      if (buffer.trim()) {
        yield* this.parseSSELines(buffer.split("\n"));
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Get task status and results
   *
   * @param taskId - Task ID to retrieve
   * @returns Task object with status and results
   *
   * @example
   * ```typescript
   * const task = await client.getTask("task_abc123");
   * if (task.status === "completed") {
   *   console.log(task.result?.summary);
   * }
   * ```
   */
  async getTask(taskId: string): Promise<Task> {
    return this.request<Task>("GET", `/v1/tasks/${taskId}`);
  }

  /**
   * List tasks for the authenticated API key
   *
   * Returns tasks in reverse chronological order (newest first).
   *
   * @param options - Listing options (pagination and filtering)
   * @returns Task list with pagination info
   *
   * @example
   * ```typescript
   * // Get the first 10 tasks
   * const result = await client.listTasks({ limit: 10 });
   * console.log(`Found ${result.pagination.total} tasks`);
   *
   * // Filter by status
   * const completed = await client.listTasks({ status: "completed" });
   *
   * // Paginate through all tasks
   * let offset = 0;
   * while (true) {
   *   const page = await client.listTasks({ limit: 20, offset });
   *   for (const task of page.tasks) {
   *     console.log(task.id, task.status);
   *   }
   *   if (!page.pagination.hasMore) break;
   *   offset += page.tasks.length;
   * }
   * ```
   */
  async listTasks(options: ListTasksOptions = {}): Promise<TaskListResponse> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) {
      params.set("limit", String(options.limit));
    }
    if (options.offset !== undefined) {
      params.set("offset", String(options.offset));
    }
    if (options.status !== undefined) {
      params.set("status", options.status);
    }
    const queryString = params.toString();
    const path = queryString ? `/v1/tasks?${queryString}` : "/v1/tasks";
    return this.request<TaskListResponse>("GET", path);
  }

  /**
   * Cancel a running or pending task
   *
   * @param taskId - Task ID to cancel
   * @returns Cancellation confirmation
   *
   * @example
   * ```typescript
   * const response = await client.cancelTask("task_abc123");
   * console.log(`Task cancelled at ${response.cancelledAt}`);
   * ```
   */
  async cancelTask(taskId: string): Promise<CancelTaskResponse> {
    return this.request<CancelTaskResponse>(
      "POST",
      `/v1/tasks/${taskId}/cancel`,
    );
  }

  /**
   * Get task logs
   *
   * @param taskId - Task ID
   * @returns Log content as text
   *
   * @example
   * ```typescript
   * const logs = await client.getTaskLogs("task_abc123");
   * console.log(logs);
   * ```
   */
  async getTaskLogs(taskId: string): Promise<string> {
    return this.requestText(`/v1/tasks/${taskId}/logs`);
  }

  /**
   * Get task diff (git diff of all changes)
   *
   * @param taskId - Task ID
   * @returns Diff content as text
   *
   * @example
   * ```typescript
   * const diff = await client.getTaskDiff("task_abc123");
   * console.log(diff);
   * ```
   */
  async getTaskDiff(taskId: string): Promise<string> {
    return this.requestText(`/v1/tasks/${taskId}/diff`);
  }

  /**
   * Push task changes to remote repository
   *
   * Only works for completed tasks. Can optionally create a pull request.
   *
   * @param taskId - Task ID
   * @param input - Push configuration
   * @returns Push result
   *
   * @example
   * ```typescript
   * const result = await client.pushTaskChanges("task_abc123", {
   *   branch: "claude/fix-tests",
   *   credentials: { type: "token", value: "ghp_xxx" },
   *   createPR: true,
   *   prTitle: "Fix failing tests",
   *   prBody: "This PR fixes the failing tests in the auth module."
   * });
   *
   * if (result.pullRequest) {
   *   console.log(`PR created: ${result.pullRequest.url}`);
   * }
   * ```
   */
  async pushTaskChanges(
    taskId: string,
    input: PushTaskInput,
  ): Promise<PushTaskResponse> {
    return this.request<PushTaskResponse>(
      "POST",
      `/v1/tasks/${taskId}/push`,
      input,
    );
  }

  /**
   * Poll for task completion
   *
   * Convenience method that polls `getTask()` until the task completes or fails.
   *
   * @param taskId - Task ID to poll
   * @param options - Polling options
   * @returns Completed task
   *
   * @example
   * ```typescript
   * const task = await client.waitForTask("task_abc123", {
   *   intervalMs: 2000,
   *   timeoutMs: 300000
   * });
   * console.log(`Task ${task.status}: ${task.result?.summary}`);
   * ```
   */
  async waitForTask(
    taskId: string,
    options: {
      /** Polling interval in milliseconds (default: 1000) */
      intervalMs?: number;
      /** Timeout in milliseconds (default: 600000 = 10 min) */
      timeoutMs?: number;
      /** Callback for each poll */
      onPoll?: (task: Task) => void;
    } = {},
  ): Promise<Task> {
    const { intervalMs = 1000, timeoutMs = 600000, onPoll } = options;
    const startTime = Date.now();

    while (true) {
      const task = await this.getTask(taskId);

      if (onPoll) {
        onPoll(task);
      }

      if (
        task.status === "completed" ||
        task.status === "failed" ||
        task.status === "cancelled"
      ) {
        return task;
      }

      if (Date.now() - startTime > timeoutMs) {
        throw new HeliosError(
          `Timeout waiting for task ${taskId}`,
          undefined,
          "TIMEOUT",
        );
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}
