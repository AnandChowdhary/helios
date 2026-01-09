export interface Env {
  // KV Namespaces
  TASKS: KVNamespace;
  API_KEYS: KVNamespace;
  RATE_LIMITS: KVNamespace;
  USAGE: KVNamespace;

  // R2 Bucket for storing logs and artifacts
  ARTIFACTS: R2Bucket;

  // Queue (requires Workers Paid plan)
  TASK_QUEUE?: Queue<TaskQueueMessage>;

  // Container binding for Claude Code runner
  // This is a DurableObjectNamespace that creates container-enabled Durable Objects
  CLAUDE_RUNNER: DurableObjectNamespace;

  // Secrets (set via wrangler secret put)
  WEBHOOK_SIGNING_KEY?: string;

  // Environment
  ENVIRONMENT: string;
}

export interface Task {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  prompt: string;
  repository: {
    url: string;
    branch: string;
  };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: TaskResult;
  error?: string;
  containerId?: string;
  apiKeyId?: string; // ID of the API key that created this task
}

export interface TaskResult {
  success: boolean;
  summary: string;
  filesChanged: FileChange[];
  diff?: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface FileChange {
  path: string;
  additions: number;
  deletions: number;
}

export interface TaskQueueMessage {
  taskId: string;
  apiKeyId: string; // ID of the API key that created this task
  prompt: string;
  repository: {
    url: string;
    branch: string;
  };
  claude: {
    apiKey: string;
    model: string;
    maxTurns: number;
    systemPrompt?: string;
  };
  options: {
    timeout: number;
    allowedTools: string[];
    workingDirectory: string;
    environment?: Record<string, string>;
  };
  webhook?: {
    url: string;
    secret: string;
  };
  gitToken?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  keyHash: string;
  createdAt: string;
  rateLimit: number; // requests per minute
  concurrentTaskLimit: number; // maximum concurrent running tasks (default: 5)
  enabled: boolean;
  skipRateLimit?: boolean; // Optional: bypass rate limiting for this key
  skipConcurrentLimit?: boolean; // Optional: bypass concurrent task limit for this key
}

/**
 * WebSocket stream message types sent from server to client
 */
export type WebSocketMessageType =
  | "connected"
  | "status"
  | "message"
  | "tool_use"
  | "tool_result"
  | "error"
  | "complete";

/**
 * WebSocket message sent from server to client during task streaming
 */
export interface WebSocketStreamMessage {
  type: WebSocketMessageType;
  taskId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * WebSocket client command types
 */
export type WebSocketClientCommand = "ping" | "cancel";

/**
 * WebSocket message sent from client to server
 */
export interface WebSocketClientMessage {
  command: WebSocketClientCommand;
  taskId?: string;
}

/**
 * Task index entry stored for each API key
 * Stored in TASKS KV with key: index:{apiKeyId}
 * Contains array of task IDs in reverse chronological order (newest first)
 */
export interface TaskIndex {
  apiKeyId: string;
  taskIds: string[]; // Task IDs in reverse chronological order
  updatedAt: string; // ISO timestamp of last update
}

/**
 * Response for listing tasks
 */
export interface TaskListResponse {
  tasks: Task[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Daily usage metrics aggregated per API key
 * Stored in USAGE KV with key: {apiKeyId}:{YYYY-MM-DD}
 */
export interface DailyUsage {
  apiKeyId: string;
  date: string; // YYYY-MM-DD format
  requests: number; // Total API requests made
  tasksCreated: number; // Number of tasks created
  tasksCompleted: number; // Number of tasks completed successfully
  tasksFailed: number; // Number of tasks that failed
  tasksCancelled: number; // Number of tasks cancelled
  inputTokens: number; // Total input tokens (Claude API)
  outputTokens: number; // Total output tokens (Claude API)
  totalDurationMs: number; // Total task duration in milliseconds
}

/**
 * Usage summary for a given period (returned by GET /v1/usage)
 */
export interface UsageSummary {
  apiKeyId: string;
  period: {
    start: string; // ISO date
    end: string; // ISO date
  };
  totals: {
    requests: number;
    tasksCreated: number;
    tasksCompleted: number;
    tasksFailed: number;
    tasksCancelled: number;
    inputTokens: number;
    outputTokens: number;
    totalDurationMs: number;
    estimatedCost: number; // Calculated cost based on token usage
  };
  daily: DailyUsage[]; // Daily breakdown
}
