export interface Env {
  // KV Namespaces
  TASKS: KVNamespace;
  API_KEYS: KVNamespace;
  RATE_LIMITS: KVNamespace;

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
