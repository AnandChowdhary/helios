/**
 * Task status values
 */
export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Claude model options
 */
export type ClaudeModel = "claude-sonnet-4-5" | "claude-opus-4";

/**
 * Output mode for task execution
 */
export type OutputMode = "sync" | "async";

/**
 * Repository credentials
 */
export interface RepositoryCredentials {
  type: "token";
  value: string;
}

/**
 * Repository configuration
 */
export interface Repository {
  /** Git repository URL (must be GitHub, GitLab, or Bitbucket) */
  url: string;
  /** Branch to clone (defaults to "main") */
  branch?: string;
  /** Git credentials for private repositories */
  credentials?: RepositoryCredentials;
}

/**
 * Claude configuration
 */
export interface ClaudeConfig {
  /** Anthropic API key (must start with "sk-ant-") */
  apiKey: string;
  /** Claude model to use (defaults to "claude-sonnet-4-5") */
  model?: ClaudeModel;
  /** Maximum conversation turns (1-50, defaults to 10) */
  maxTurns?: number;
  /** Custom system prompt */
  systemPrompt?: string;
}

/**
 * Task execution options
 */
export interface TaskOptions {
  /** Timeout in seconds (30-600, defaults to 300) */
  timeout?: number;
  /** Allowed Claude Code tools */
  allowedTools?: string[];
  /** Working directory in container */
  workingDirectory?: string;
  /** Environment variables */
  environment?: Record<string, string>;
}

/**
 * Webhook configuration for async tasks
 */
export interface WebhookConfig {
  /** Webhook URL to call on completion */
  url: string;
  /** Secret for HMAC signature (min 16 chars) */
  secret: string;
}

/**
 * Output configuration
 */
export interface OutputConfig {
  /** Execution mode */
  mode?: OutputMode;
  /** Webhook configuration for notifications */
  webhook?: WebhookConfig;
}

/**
 * Input for creating a new task
 */
export interface CreateTaskInput {
  /** The prompt/instruction for Claude */
  prompt: string;
  /** Repository to clone and work on */
  repository: Repository;
  /** Claude configuration including API key */
  claude: ClaudeConfig;
  /** Task execution options */
  options?: TaskOptions;
  /** Output configuration */
  output?: OutputConfig;
}

/**
 * File change information
 */
export interface FileChange {
  /** File path */
  path: string;
  /** Number of lines added */
  additions: number;
  /** Number of lines deleted */
  deletions: number;
}

/**
 * Token usage information
 */
export interface TokenUsage {
  /** Input tokens consumed */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
}

/**
 * Task result
 */
export interface TaskResult {
  /** Whether the task succeeded */
  success: boolean;
  /** Summary of what was done */
  summary: string;
  /** Files that were modified */
  filesChanged: FileChange[];
  /** Git diff of all changes */
  diff?: string;
  /** Token usage */
  usage: TokenUsage;
}

/**
 * Task object
 */
export interface Task {
  /** Unique task ID */
  id: string;
  /** Current status */
  status: TaskStatus;
  /** Original prompt */
  prompt: string;
  /** Repository info */
  repository: {
    url: string;
    branch: string;
  };
  /** When the task was created */
  createdAt: string;
  /** When the task started running */
  startedAt?: string;
  /** When the task completed */
  completedAt?: string;
  /** Task result (if completed) */
  result?: TaskResult;
  /** Error message (if failed) */
  error?: string;
  /** Container ID */
  containerId?: string;
}

/**
 * Response from creating an async task
 */
export interface AsyncTaskResponse {
  /** Task ID */
  taskId: string;
  /** Initial status */
  status: "pending";
  /** Creation timestamp */
  createdAt: string;
  /** URL to check status */
  statusUrl: string;
}

/**
 * Response from cancelling a task
 */
export interface CancelTaskResponse {
  /** Task ID */
  taskId: string;
  /** New status */
  status: "cancelled";
  /** When cancelled */
  cancelledAt: string;
}

/**
 * Input for pushing changes
 */
export interface PushTaskInput {
  /** Branch name to push to */
  branch: string;
  /** Git credentials for pushing */
  credentials: RepositoryCredentials;
  /** Whether to create a PR (GitHub only) */
  createPR?: boolean;
  /** PR title (if createPR is true) */
  prTitle?: string;
  /** PR body (if createPR is true) */
  prBody?: string;
}

/**
 * Pull request information
 */
export interface PullRequestInfo {
  /** PR URL */
  url: string;
  /** PR number */
  number: number;
}

/**
 * Response from pushing changes
 */
export interface PushTaskResponse {
  /** Task ID */
  taskId: string;
  /** Whether push succeeded */
  success: boolean;
  /** Branch pushed to */
  branch?: string;
  /** Success/error message */
  message?: string;
  /** Error details */
  error?: string;
  /** Pull request info (if created) */
  pullRequest?: PullRequestInfo;
  /** PR creation error (if PR failed but push succeeded) */
  pullRequestError?: string;
}

/**
 * SSE event types
 */
export type SSEEventType =
  | "status"
  | "message"
  | "tool_use"
  | "tool_result"
  | "complete"
  | "error"
  | "log";

/**
 * SSE event
 */
export interface SSEEvent {
  /** Event type */
  event: SSEEventType;
  /** Event data */
  data: unknown;
}

/**
 * Error response from API
 */
export interface APIError {
  error: {
    message: string;
  };
}

/**
 * Retry configuration for automatic exponential backoff
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds between retries (default: 10000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Whether to retry on rate limit errors (429) (default: true) */
  retryOnRateLimit?: boolean;
}

/**
 * Helios client configuration
 */
export interface HeliosConfig {
  /** Helios API key */
  apiKey: string;
  /** Base URL (defaults to production) */
  baseUrl?: string;
  /** Retry configuration for transient failures (default: enabled with sensible defaults) */
  retry?: RetryConfig | false;
}

/**
 * Input for creating an async task (webhook optional, mode forced to async)
 */
export interface CreateAsyncTaskInput {
  /** The prompt/instruction for Claude */
  prompt: string;
  /** Repository to clone and work on */
  repository: Repository;
  /** Claude configuration including API key */
  claude: ClaudeConfig;
  /** Task execution options */
  options?: TaskOptions;
  /** Webhook configuration for completion notifications */
  webhook?: WebhookConfig;
}

/**
 * Input for creating a sync/streaming task (no output config needed)
 */
export interface CreateStreamTaskInput {
  /** The prompt/instruction for Claude */
  prompt: string;
  /** Repository to clone and work on */
  repository: Repository;
  /** Claude configuration including API key */
  claude: ClaudeConfig;
  /** Task execution options */
  options?: TaskOptions;
}

/**
 * Options for listing tasks
 */
export interface ListTasksOptions {
  /** Maximum number of tasks to return (1-100, defaults to 20) */
  limit?: number;
  /** Number of tasks to skip (defaults to 0) */
  offset?: number;
  /** Filter by task status */
  status?: TaskStatus;
}

/**
 * Pagination information for task listing
 */
export interface TaskListPagination {
  /** Total number of tasks matching the filter */
  total: number;
  /** Limit used in the query */
  limit: number;
  /** Offset used in the query */
  offset: number;
  /** Whether there are more tasks to fetch */
  hasMore: boolean;
}

/**
 * Response from listing tasks
 */
export interface TaskListResponse {
  /** Array of tasks */
  tasks: Task[];
  /** Pagination information */
  pagination: TaskListPagination;
}
