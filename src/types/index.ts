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
  enabled: boolean;
}
