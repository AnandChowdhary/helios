export { HeliosClient, HeliosError } from "./client.js";
export type {
  // Config
  HeliosConfig,
  // Task creation
  CreateTaskInput,
  CreateAsyncTaskInput,
  CreateStreamTaskInput,
  Repository,
  RepositoryCredentials,
  ClaudeConfig,
  ClaudeModel,
  TaskOptions,
  OutputConfig,
  OutputMode,
  WebhookConfig,
  // Task results
  Task,
  TaskStatus,
  TaskResult,
  FileChange,
  TokenUsage,
  // Task listing
  ListTasksOptions,
  TaskListPagination,
  TaskListResponse,
  // Async responses
  AsyncTaskResponse,
  CancelTaskResponse,
  // Push
  PushTaskInput,
  PushTaskResponse,
  PullRequestInfo,
  // Streaming
  SSEEvent,
  SSEEventType,
  // Errors
  APIError,
} from "./types.js";
