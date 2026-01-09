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
} from "./types.js";

const DEFAULT_BASE_URL = "https://helios.getelysium.workers.dev";

/**
 * Error thrown by the Helios SDK
 */
export class HeliosError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "HeliosError";
  }
}

/**
 * Helios SDK client for interacting with the Cloud Claude Code API
 */
export class HeliosClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

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
  }

  /**
   * Extract error message from a failed response
   */
  private async extractErrorMessage(
    response: Response,
  ): Promise<string> {
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const errorData = (await response.json()) as APIError;
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      }
    } catch {
      // Use default error message
    }
    return errorMessage;
  }

  /**
   * Make an authenticated request to the API
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

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorMessage = await this.extractErrorMessage(response);
      throw new HeliosError(errorMessage, response.status);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Make an authenticated request that returns text
   */
  private async requestText(path: string): Promise<string> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorMessage = await this.extractErrorMessage(response);
      throw new HeliosError(errorMessage, response.status);
    }

    return response.text();
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
  async createTaskAsync(input: CreateAsyncTaskInput): Promise<AsyncTaskResponse> {
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
      const errorMessage = await this.extractErrorMessage(response);
      throw new HeliosError(errorMessage, response.status);
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
