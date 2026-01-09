# Helios: Cloud Claude Code API Service

## Product Overview

Helios is a developer API service that provides on-demand Claude Code instances in the cloud. Developers can programmatically spin up isolated containers, clone repositories, execute Claude Code tasks, and retrieve results - all through a simple REST API.

Think of it as "Claude Code as a Service" - the same powerful agentic coding assistant, but accessible via API for automation, CI/CD pipelines, and building AI-powered developer tools.

### Use Cases

- **Automated Code Review**: Trigger Claude Code to review PRs on push
- **Bug Fixing Pipelines**: Submit issues and get back code fixes
- **Code Generation**: Generate features from natural language specs
- **Refactoring at Scale**: Batch process repositories for migrations
- **Developer Tools**: Build IDE plugins, Slack bots, or CLI tools powered by Claude Code

---

## API Design

### Core Principles

1. **Simple by default**: One endpoint to run a task, one to check status
2. **Streaming support**: Real-time output via SSE or WebSocket
3. **Bring your own repo**: Git clone any repository into the container
4. **Isolated execution**: Each task runs in its own ephemeral container
5. **Credential passthrough**: API keys passed per-request, never stored

### Authentication

```
Authorization: Bearer <HELIOS_API_KEY>
```

All requests require an API key. Claude/Anthropic API credentials are passed per-request in the payload (not stored on server).

---

### Endpoints

#### `POST /v1/tasks`

Create and execute a Claude Code task.

**Request:**

```json
{
  "prompt": "Fix the failing tests in the auth module",
  "repository": {
    "url": "https://github.com/user/repo.git",
    "branch": "main",
    "credentials": {
      "type": "token",
      "value": "ghp_xxx"
    }
  },
  "claude": {
    "apiKey": "sk-ant-xxx",
    "model": "claude-sonnet-4-5",
    "maxTurns": 10,
    "systemPrompt": "You are a senior engineer..."
  },
  "options": {
    "timeout": 300,
    "allowedTools": ["Read", "Write", "Bash", "Glob", "Grep"],
    "workingDirectory": "/workspace",
    "environment": {
      "NODE_ENV": "test"
    }
  },
  "output": {
    "mode": "async",
    "webhook": {
      "url": "https://your-server.com/webhook",
      "secret": "webhook-secret-for-hmac"
    },
    "artifacts": {
      "diff": true,
      "files": ["**/*.ts", "**/*.tsx"],
      "logs": true
    }
  }
}
```

**Response (Async Mode - 202 Accepted):**

```json
{
  "taskId": "task_abc123",
  "status": "pending",
  "createdAt": "2025-01-08T10:00:00Z",
  "estimatedDuration": 120,
  "streamUrl": "wss://api.helios.dev/v1/tasks/task_abc123/stream",
  "statusUrl": "https://api.helios.dev/v1/tasks/task_abc123"
}
```

**Response (Sync Mode with SSE):**

```
HTTP/1.1 200 OK
Content-Type: text/event-stream

event: status
data: {"status": "cloning", "message": "Cloning repository..."}

event: message
data: {"type": "assistant", "content": "I'll start by reading the test files..."}

event: tool_use
data: {"tool": "Read", "input": {"path": "src/auth/__tests__/auth.test.ts"}}

event: message
data: {"type": "assistant", "content": "I found the issue..."}

event: complete
data: {"status": "completed", "result": {...}}
```

---

#### `GET /v1/tasks/:taskId`

Get task status and results.

**Response:**

```json
{
  "taskId": "task_abc123",
  "status": "completed",
  "createdAt": "2025-01-08T10:00:00Z",
  "completedAt": "2025-01-08T10:02:30Z",
  "duration": 150,
  "result": {
    "success": true,
    "summary": "Fixed 3 failing tests in auth module",
    "filesChanged": [
      {
        "path": "src/auth/login.ts",
        "additions": 12,
        "deletions": 5
      }
    ],
    "diff": "diff --git a/src/auth/login.ts...",
    "commits": [
      {
        "sha": "abc123",
        "message": "Fix auth token validation"
      }
    ]
  },
  "artifacts": {
    "logs": "https://api.helios.dev/v1/tasks/task_abc123/logs",
    "diff": "https://api.helios.dev/v1/tasks/task_abc123/diff"
  },
  "usage": {
    "inputTokens": 15000,
    "outputTokens": 3200,
    "totalCost": 0.12
  }
}
```

---

#### `GET /v1/tasks/:taskId/stream`

WebSocket endpoint for real-time streaming.

**Messages:**

```json
// Status updates
{"type": "status", "status": "running", "stage": "executing"}

// Claude's thinking/responses
{"type": "assistant", "content": "Let me analyze...", "streaming": true}

// Tool usage
{"type": "tool_use", "tool": "Bash", "input": {"command": "npm test"}}
{"type": "tool_result", "tool": "Bash", "output": "...test output..."}

// Completion
{"type": "complete", "result": {...}}

// Errors
{"type": "error", "code": "TIMEOUT", "message": "Task exceeded time limit"}
```

---

#### `POST /v1/tasks/:taskId/cancel`

Cancel a running task.

**Response:**

```json
{
  "taskId": "task_abc123",
  "status": "cancelled",
  "cancelledAt": "2025-01-08T10:01:00Z"
}
```

---

#### `GET /v1/tasks/:taskId/logs`

Get full execution logs.

---

#### `GET /v1/tasks/:taskId/diff`

Get the git diff of all changes made.

---

#### `POST /v1/tasks/:taskId/push`

Push changes to remote (requires git credentials in original request).

**Request:**

```json
{
  "branch": "claude/fix-auth-tests",
  "createPR": true,
  "prTitle": "Fix failing auth tests",
  "prBody": "Automated fix by Claude Code"
}
```

---

### Webhook Payloads

When a task completes, Helios sends a webhook:

```json
{
  "event": "task.completed",
  "taskId": "task_abc123",
  "status": "completed",
  "result": {...},
  "metadata": {...}
}
```

Webhook signature (HMAC-SHA256):

```
X-Helios-Signature: sha256=<hmac-of-body>
```

---

## Architecture

### Recommended: Cloudflare Containers

Cloudflare Containers (launched June 2025) is ideal for this use case:

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌──────────────────────────────────┐   │
│  │   Worker    │───▶│         Container                 │   │
│  │  (Router)   │    │  ┌──────────────────────────┐    │   │
│  │             │    │  │    Claude Agent SDK      │    │   │
│  │ - Auth      │    │  │    + Git + Node.js       │    │   │
│  │ - Rate Limit│    │  │    + Project Tools       │    │   │
│  │ - Queue     │    │  └──────────────────────────┘    │   │
│  │ - WebSocket │    │                                   │   │
│  └─────────────┘    └──────────────────────────────────┘   │
│         │                         │                         │
│         ▼                         ▼                         │
│  ┌─────────────┐          ┌─────────────┐                  │
│  │  Durable    │          │     R2      │                  │
│  │  Objects    │          │  (Storage)  │                  │
│  │ (Task State)│          │ (Logs/Diffs)│                  │
│  └─────────────┘          └─────────────┘                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Why Cloudflare:**

- **Programmable containers**: Workers control container lifecycle via code
- **Scale to zero**: Only pay when containers are running
- **Global edge**: Containers spin up close to users
- **Integrated storage**: R2 for artifacts, Durable Objects for state
- **WebSocket support**: Native streaming support

**Pricing** (as of 2025):

- Workers Paid: $5/month base
- Containers: Billed per 10ms of active runtime
- R2: $0.015/GB storage, free egress

---

### Alternative: Self-Hosted (Docker + Any Cloud)

For more control or existing infrastructure:

```
┌─────────────────────────────────────────────────────────────┐
│                      Load Balancer                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     API Server (Hono)                       │
│  - Authentication                                           │
│  - Task queue management                                    │
│  - WebSocket connections                                    │
│  - Webhook dispatch                                         │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Container  │      │  Container  │      │  Container  │
│   (Task 1)  │      │   (Task 2)  │      │   (Task 3)  │
└─────────────┘      └─────────────┘      └─────────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                    ┌─────────────────┐
                    │    Storage      │
                    │  (S3/GCS/R2)    │
                    └─────────────────┘
```

**Stack:**

- **API Server**: Hono on Node.js (like claude-agent-sdk-container)
- **Container Runtime**: Docker/Podman
- **Queue**: Redis or BullMQ for task queue
- **Storage**: S3/GCS for logs and artifacts
- **Database**: PostgreSQL for task metadata

---

## Container Image

The container image should include:

```dockerfile
FROM node:22-slim

# System dependencies
RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    curl \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code@latest

# Install Claude Agent SDK
RUN npm install -g @anthropic-ai/claude-agent-sdk

# Create non-root user
RUN useradd -m -s /bin/bash claude
USER claude
WORKDIR /workspace

# Entry script that:
# 1. Clones the repository
# 2. Sets up git credentials
# 3. Runs Claude Agent SDK with the prompt
COPY --chown=claude:claude entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
```

---

## Security Considerations

### Credential Handling

1. **Never store credentials**: API keys passed per-request, used once, discarded
2. **Ephemeral containers**: Each task gets fresh container, destroyed after completion
3. **Network isolation**: Containers can only access:
   - Anthropic API (for Claude)
   - Git remote (for cloning)
   - Webhook URLs (for callbacks)
4. **No persistent storage**: Container filesystem is ephemeral

### Input Validation

```typescript
const TaskSchema = z.object({
  prompt: z.string().max(100000),
  repository: z.object({
    url: z
      .string()
      .url()
      .regex(/^https:\/\/(github|gitlab|bitbucket)/),
    branch: z
      .string()
      .max(100)
      .regex(/^[a-zA-Z0-9_\-\/]+$/),
    credentials: z
      .object({
        type: z.enum(["token", "ssh"]),
        value: z.string(),
      })
      .optional(),
  }),
  claude: z.object({
    apiKey: z.string().startsWith("sk-ant-"),
    model: z.enum(["claude-sonnet-4-5", "claude-opus-4"]),
    maxTurns: z.number().int().min(1).max(100).default(10),
  }),
  options: z
    .object({
      timeout: z.number().int().min(30).max(3600).default(300),
      allowedTools: z
        .array(z.string())
        .default(["Read", "Write", "Bash", "Glob", "Grep"]),
    })
    .optional(),
});
```

### Rate Limiting

- Per-API-key rate limits
- Concurrent task limits
- Cost-based throttling (based on token usage)

### Sandboxing

Use `--dangerously-skip-permissions` only because:

- Container is fully isolated
- No access to host filesystem
- Network restricted to allowlist
- Container destroyed after task

---

## Implementation Phases

### Phase 1: Core API (MVP)

- [ ] Task creation endpoint (`POST /v1/tasks`)
- [ ] Task status endpoint (`GET /v1/tasks/:taskId`)
- [ ] Synchronous execution with streaming (SSE)
- [ ] Basic container lifecycle (start, run, destroy)
- [ ] Git clone and credential handling
- [ ] Single Cloudflare Container deployment

### Phase 2: Async & Webhooks

- [x] Async task execution
- [x] Webhook notifications
- [x] Task cancellation
- [x] Logs and diff storage (R2/S3)
- [x] Push-to-remote endpoint

### Phase 3: Scale & Polish

- [ ] WebSocket streaming
- [ ] Concurrent task limits per account
- [ ] Usage tracking and billing
- [ ] Dashboard UI (optional)
- [x] SDK clients (TypeScript)
- [x] SDK clients (Python)

---

## Reference Implementations

These existing projects informed this design:

1. **[claude-agent-sdk-container](https://github.com/receipting/claude-agent-sdk-container)**
   - REST API + WebSocket with Hono
   - GitHub OAuth authentication
   - Session management

2. **[claude-code-sandbox](https://github.com/textcortex/claude-code-sandbox)**
   - Docker container management
   - Git branch isolation
   - Credential discovery and forwarding
   - File copying (not mounting) for isolation

3. **[cloudrun-claude-code](https://github.com/mslavov/cloudrun-claude-code)**
   - Cloud Run deployment pattern
   - Async tasks with webhooks
   - KMS encryption for secrets
   - Per-request credential isolation

4. **[Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-python)**
   - Official SDK for programmatic Claude Code
   - Streaming responses via AsyncIterator
   - Custom tools and hooks
   - Headless operation

---

## Cloudflare Container Example

```typescript
// worker.ts - Cloudflare Worker that orchestrates containers
import { Container } from "cloudflare:container";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/v1/tasks" && request.method === "POST") {
      const body = await request.json();
      const taskId = crypto.randomUUID();

      // Spin up container for this task
      const container = await env.CLAUDE_CONTAINER.start({
        id: taskId,
        env: {
          ANTHROPIC_API_KEY: body.claude.apiKey,
          REPO_URL: body.repository.url,
          REPO_BRANCH: body.repository.branch,
          PROMPT: body.prompt,
          GIT_TOKEN: body.repository.credentials?.value,
        },
      });

      // For sync mode, stream responses
      if (body.output?.mode !== "async") {
        return new Response(container.readable, {
          headers: { "Content-Type": "text/event-stream" },
        });
      }

      // For async mode, store task state and return immediately
      await env.TASKS.put(
        taskId,
        JSON.stringify({
          status: "running",
          containerId: container.id,
          createdAt: new Date().toISOString(),
        }),
      );

      return Response.json({ taskId, status: "pending" }, { status: 202 });
    }

    // ... other endpoints
  },
};
```

---

# Helios Phase 1: Implementation Plan

## Overview

This document outlines the implementation plan for Helios MVP - a cloud API service for running Claude Code instances, deployed entirely on Cloudflare infrastructure.

### Tech Stack

| Component     | Technology                      |
| ------------- | ------------------------------- |
| Runtime       | Cloudflare Workers              |
| Containers    | Cloudflare Containers           |
| Database      | Cloudflare KV (task metadata)   |
| Storage       | Cloudflare R2 (logs, artifacts) |
| Rate Limiting | Cloudflare Rate Limiting API    |
| Queue         | Cloudflare Queues               |
| Auth          | API Keys (stored in KV)         |
| Language      | TypeScript                      |
| Build         | Wrangler + esbuild              |
| CI/CD         | GitHub Actions                  |

---

## Project Structure

```
helios/
├── src/
│   ├── index.ts                 # Worker entry point
│   ├── router.ts                # Hono router setup
│   ├── routes/
│   │   ├── tasks.ts             # POST /v1/tasks, GET /v1/tasks/:id
│   │   ├── health.ts            # GET /health
│   │   └── stream.ts            # WebSocket /v1/tasks/:id/stream
│   ├── services/
│   │   ├── container.ts         # Container lifecycle management
│   │   ├── git.ts               # Git clone operations
│   │   └── claude.ts            # Claude Agent SDK wrapper
│   ├── middleware/
│   │   ├── auth.ts              # API key authentication
│   │   ├── rateLimit.ts         # Rate limiting
│   │   └── validate.ts          # Request validation (Zod)
│   ├── schemas/
│   │   └── task.ts              # Zod schemas for API
│   ├── types/
│   │   └── index.ts             # TypeScript types
│   └── utils/
│       ├── errors.ts            # Error handling
│       ├── sse.ts               # SSE streaming utilities
│       └── crypto.ts            # HMAC, ID generation
├── container/
│   ├── Dockerfile               # Claude Code container image
│   ├── entrypoint.sh            # Container startup script
│   └── package.json             # Container dependencies
├── test/
│   ├── unit/
│   │   ├── auth.test.ts
│   │   ├── validation.test.ts
│   │   └── container.test.ts
│   ├── integration/
│   │   ├── tasks.test.ts
│   │   └── streaming.test.ts
│   └── e2e/
│       └── full-flow.test.ts
├── scripts/
│   ├── setup-kv.ts              # Initialize KV namespaces
│   ├── setup-r2.ts              # Initialize R2 buckets
│   └── seed-api-keys.ts         # Create test API keys
├── .github/
│   └── workflows/
│       ├── ci.yml               # Test on PR
│       ├── deploy-staging.yml   # Deploy to staging
│       └── deploy-prod.yml      # Deploy to production
├── wrangler.toml                # Cloudflare config
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

---

## Implementation Tasks

### 1. Project Setup

#### 1.1 Initialize Project

```bash
# Create project
mkdir helios && cd helios
npm init -y

# Install dependencies
npm install hono zod uuid
npm install -D wrangler typescript vitest @cloudflare/workers-types
npm install -D @types/node esbuild

# Initialize TypeScript
npx tsc --init
```

#### 1.2 Configure Wrangler

```toml
# wrangler.toml
name = "helios"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

# Environment variables (secrets added via wrangler secret)
[vars]
ENVIRONMENT = "production"

# KV Namespaces
[[kv_namespaces]]
binding = "TASKS"
id = "<tasks-kv-id>"

[[kv_namespaces]]
binding = "API_KEYS"
id = "<api-keys-kv-id>"

[[kv_namespaces]]
binding = "RATE_LIMITS"
id = "<rate-limits-kv-id>"

# R2 Buckets
[[r2_buckets]]
binding = "ARTIFACTS"
bucket_name = "helios-artifacts"

# Queues (for async tasks)
[[queues.producers]]
binding = "TASK_QUEUE"
queue = "helios-tasks"

[[queues.consumers]]
queue = "helios-tasks"
max_batch_size = 1
max_batch_timeout = 30

# Containers
[containers]
  [containers.CLAUDE_RUNNER]
  image = "helios-claude-runner:latest"
  max_instances = 10

# Staging environment
[env.staging]
name = "helios-staging"
vars = { ENVIRONMENT = "staging" }

[[env.staging.kv_namespaces]]
binding = "TASKS"
id = "<staging-tasks-kv-id>"
```

#### 1.3 TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

### 2. Core Worker Implementation

#### 2.1 Entry Point & Router

```typescript
// src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { tasksRouter } from "./routes/tasks";
import { healthRouter } from "./routes/health";
import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { errorHandler } from "./utils/errors";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use("*", cors());
app.use("*", logger());
app.onError(errorHandler);

// Public routes
app.route("/health", healthRouter);

// Protected routes
app.use("/v1/*", authMiddleware);
app.use("/v1/*", rateLimitMiddleware);
app.route("/v1/tasks", tasksRouter);

// Queue consumer for async tasks
export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<TaskQueueMessage>, env: Env) {
    for (const message of batch.messages) {
      await processAsyncTask(message.body, env);
      message.ack();
    }
  },
};
```

#### 2.2 Types

```typescript
// src/types/index.ts
export interface Env {
  // KV Namespaces
  TASKS: KVNamespace;
  API_KEYS: KVNamespace;
  RATE_LIMITS: KVNamespace;

  // R2 Bucket
  ARTIFACTS: R2Bucket;

  // Queue
  TASK_QUEUE: Queue<TaskQueueMessage>;

  // Container
  CLAUDE_RUNNER: Container;

  // Secrets (set via wrangler secret put)
  WEBHOOK_SIGNING_KEY: string;
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
  claudeApiKey: string;
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
```

#### 2.3 Schemas

```typescript
// src/schemas/task.ts
import { z } from "zod";

export const CreateTaskSchema = z.object({
  prompt: z.string().min(1).max(100000),
  repository: z.object({
    url: z
      .string()
      .url()
      .refine(
        (url) =>
          /^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)/.test(url),
        "Only GitHub, GitLab, and Bitbucket URLs are supported",
      ),
    branch: z
      .string()
      .max(100)
      .regex(/^[a-zA-Z0-9_\-\/\.]+$/, "Invalid branch name")
      .default("main"),
    credentials: z
      .object({
        type: z.literal("token"),
        value: z.string().min(1),
      })
      .optional(),
  }),
  claude: z.object({
    apiKey: z
      .string()
      .refine(
        (key) => key.startsWith("sk-ant-"),
        "Invalid Anthropic API key format",
      ),
    model: z
      .enum(["claude-sonnet-4-5", "claude-opus-4"])
      .default("claude-sonnet-4-5"),
    maxTurns: z.number().int().min(1).max(50).default(10),
    systemPrompt: z.string().max(10000).optional(),
  }),
  options: z
    .object({
      timeout: z.number().int().min(30).max(600).default(300),
      allowedTools: z
        .array(z.string())
        .default(["Read", "Write", "Bash", "Glob", "Grep"]),
      workingDirectory: z.string().default("/workspace"),
      environment: z.record(z.string()).optional(),
    })
    .default({}),
  output: z
    .object({
      mode: z.enum(["sync", "async"]).default("sync"),
      webhook: z
        .object({
          url: z.string().url(),
          secret: z.string().min(16),
        })
        .optional(),
    })
    .default({}),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
```

---

### 3. Authentication & Rate Limiting

#### 3.1 Auth Middleware

```typescript
// src/middleware/auth.ts
import { createMiddleware } from "hono/factory";
import type { Env } from "../types";
import { HTTPException } from "hono/http-exception";

export const authMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      throw new HTTPException(401, { message: "Missing API key" });
    }

    const apiKey = authHeader.slice(7);
    const keyHash = await hashApiKey(apiKey);

    // Look up API key in KV
    const keyData = await c.env.API_KEYS.get<ApiKey>(keyHash, "json");

    if (!keyData || !keyData.enabled) {
      throw new HTTPException(401, { message: "Invalid API key" });
    }

    // Store key data for rate limiting
    c.set("apiKey", keyData);

    await next();
  },
);

async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

#### 3.2 Rate Limiting

```typescript
// src/middleware/rateLimit.ts
import { createMiddleware } from "hono/factory";
import type { Env, ApiKey } from "../types";
import { HTTPException } from "hono/http-exception";

export const rateLimitMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const apiKey = c.get("apiKey") as ApiKey;
    const now = Date.now();
    const windowKey = `${apiKey.id}:${Math.floor(now / 60000)}`; // 1-minute window

    // Get current count
    const current = await c.env.RATE_LIMITS.get(windowKey);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= apiKey.rateLimit) {
      throw new HTTPException(429, {
        message: "Rate limit exceeded",
        headers: {
          "X-RateLimit-Limit": apiKey.rateLimit.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": (
            (Math.floor(now / 60000) + 1) *
            60000
          ).toString(),
        },
      });
    }

    // Increment counter (expire after 2 minutes)
    await c.env.RATE_LIMITS.put(windowKey, (count + 1).toString(), {
      expirationTtl: 120,
    });

    // Add rate limit headers
    c.header("X-RateLimit-Limit", apiKey.rateLimit.toString());
    c.header(
      "X-RateLimit-Remaining",
      (apiKey.rateLimit - count - 1).toString(),
    );

    await next();
  },
);
```

---

### 4. Task Routes

#### 4.1 Create Task

```typescript
// src/routes/tasks.ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { CreateTaskSchema } from "../schemas/task";
import { validateBody } from "../middleware/validate";
import type { Env, Task } from "../types";

export const tasksRouter = new Hono<{ Bindings: Env }>();

// POST /v1/tasks - Create a new task
tasksRouter.post("/", validateBody(CreateTaskSchema), async (c) => {
  const input = c.req.valid("json");
  const taskId = crypto.randomUUID();

  const task: Task = {
    id: taskId,
    status: "pending",
    prompt: input.prompt,
    repository: {
      url: input.repository.url,
      branch: input.repository.branch,
    },
    createdAt: new Date().toISOString(),
  };

  // Store task in KV
  await c.env.TASKS.put(taskId, JSON.stringify(task), {
    expirationTtl: 86400 * 7, // 7 days
  });

  if (input.output.mode === "async") {
    // Queue for background processing
    await c.env.TASK_QUEUE.send({
      taskId,
      claudeApiKey: input.claude.apiKey,
      gitToken: input.repository.credentials?.value,
    });

    return c.json(
      {
        taskId,
        status: "pending",
        createdAt: task.createdAt,
        statusUrl: `${new URL(c.req.url).origin}/v1/tasks/${taskId}`,
      },
      202,
    );
  }

  // Sync mode - stream response via SSE
  return streamSSE(c, async (stream) => {
    try {
      // Update status
      task.status = "running";
      task.startedAt = new Date().toISOString();
      await c.env.TASKS.put(taskId, JSON.stringify(task));

      await stream.writeSSE({
        event: "status",
        data: JSON.stringify({ status: "running", taskId }),
      });

      // Start container
      const container = await c.env.CLAUDE_RUNNER.start({
        id: taskId,
        env: {
          ANTHROPIC_API_KEY: input.claude.apiKey,
          REPO_URL: input.repository.url,
          REPO_BRANCH: input.repository.branch,
          GIT_TOKEN: input.repository.credentials?.value || "",
          PROMPT: input.prompt,
          MODEL: input.claude.model,
          MAX_TURNS: input.claude.maxTurns.toString(),
          TIMEOUT: input.options.timeout.toString(),
        },
      });

      task.containerId = container.id;
      await c.env.TASKS.put(taskId, JSON.stringify(task));

      // Stream container output
      const reader = container.readable.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(Boolean);

        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            await stream.writeSSE({
              event: event.type,
              data: JSON.stringify(event.data),
            });
          } catch {
            // Plain text output
            await stream.writeSSE({
              event: "log",
              data: JSON.stringify({ message: line }),
            });
          }
        }
      }

      // Get final result
      const result = await container.waitUntilExit();

      task.status = result.exitCode === 0 ? "completed" : "failed";
      task.completedAt = new Date().toISOString();

      // Parse result from container output
      if (result.output) {
        task.result = JSON.parse(result.output);
      }

      await c.env.TASKS.put(taskId, JSON.stringify(task));

      // Store artifacts in R2
      if (task.result?.diff) {
        await c.env.ARTIFACTS.put(`${taskId}/diff.patch`, task.result.diff);
      }

      await stream.writeSSE({
        event: "complete",
        data: JSON.stringify({
          taskId,
          status: task.status,
          result: task.result,
        }),
      });
    } catch (error) {
      task.status = "failed";
      task.error = error instanceof Error ? error.message : "Unknown error";
      task.completedAt = new Date().toISOString();
      await c.env.TASKS.put(taskId, JSON.stringify(task));

      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({
          taskId,
          error: task.error,
        }),
      });
    }
  });
});

// GET /v1/tasks/:id - Get task status
tasksRouter.get("/:id", async (c) => {
  const taskId = c.req.param("id");
  const task = await c.env.TASKS.get<Task>(taskId, "json");

  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }

  return c.json(task);
});

// POST /v1/tasks/:id/cancel - Cancel a running task
tasksRouter.post("/:id/cancel", async (c) => {
  const taskId = c.req.param("id");
  const task = await c.env.TASKS.get<Task>(taskId, "json");

  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }

  if (task.status !== "pending" && task.status !== "running") {
    return c.json({ error: "Task cannot be cancelled" }, 400);
  }

  // Stop container if running
  if (task.containerId) {
    try {
      await c.env.CLAUDE_RUNNER.stop(task.containerId);
    } catch {
      // Container may already be stopped
    }
  }

  task.status = "cancelled";
  task.completedAt = new Date().toISOString();
  await c.env.TASKS.put(taskId, JSON.stringify(task));

  return c.json({
    taskId,
    status: "cancelled",
    cancelledAt: task.completedAt,
  });
});

// GET /v1/tasks/:id/logs - Get task logs
tasksRouter.get("/:id/logs", async (c) => {
  const taskId = c.req.param("id");
  const logs = await c.env.ARTIFACTS.get(`${taskId}/logs.txt`);

  if (!logs) {
    return c.json({ error: "Logs not found" }, 404);
  }

  return new Response(logs.body, {
    headers: { "Content-Type": "text/plain" },
  });
});

// GET /v1/tasks/:id/diff - Get task diff
tasksRouter.get("/:id/diff", async (c) => {
  const taskId = c.req.param("id");
  const diff = await c.env.ARTIFACTS.get(`${taskId}/diff.patch`);

  if (!diff) {
    return c.json({ error: "Diff not found" }, 404);
  }

  return new Response(diff.body, {
    headers: { "Content-Type": "text/x-diff" },
  });
});
```

---

### 5. Container Image

#### 5.1 Dockerfile

```dockerfile
# container/Dockerfile
FROM node:22-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code and Agent SDK
RUN npm install -g @anthropic-ai/claude-code@latest

# Create non-root user
RUN useradd -m -s /bin/bash claude \
    && mkdir -p /workspace \
    && chown -R claude:claude /workspace

# Copy entrypoint
COPY --chown=claude:claude entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER claude
WORKDIR /workspace

ENV NODE_ENV=production

ENTRYPOINT ["/entrypoint.sh"]
```

#### 5.2 Entrypoint Script

```bash
#!/bin/bash
# container/entrypoint.sh
set -e

# Output structured logs
log() {
  echo "{\"type\":\"log\",\"data\":{\"level\":\"$1\",\"message\":\"$2\"}}"
}

log "info" "Starting Helios task runner"

# Validate required env vars
: "${ANTHROPIC_API_KEY:?Required}"
: "${REPO_URL:?Required}"
: "${PROMPT:?Required}"

# Configure git
git config --global user.name "Helios Bot"
git config --global user.email "bot@helios.dev"
git config --global init.defaultBranch main

# Clone repository
log "info" "Cloning repository: $REPO_URL"
echo "{\"type\":\"status\",\"data\":{\"status\":\"cloning\",\"repository\":\"$REPO_URL\"}}"

if [ -n "$GIT_TOKEN" ]; then
  # Use token for authentication
  REPO_WITH_TOKEN=$(echo "$REPO_URL" | sed "s|https://|https://${GIT_TOKEN}@|")
  git clone --depth 100 --branch "${REPO_BRANCH:-main}" "$REPO_WITH_TOKEN" /workspace/repo 2>&1 || {
    log "error" "Failed to clone repository"
    exit 1
  }
else
  git clone --depth 100 --branch "${REPO_BRANCH:-main}" "$REPO_URL" /workspace/repo 2>&1 || {
    log "error" "Failed to clone repository"
    exit 1
  }
fi

cd /workspace/repo
log "info" "Repository cloned successfully"
echo "{\"type\":\"status\",\"data\":{\"status\":\"cloned\",\"branch\":\"$(git branch --show-current)\"}}"

# Create a working branch
BRANCH_NAME="helios/task-$(date +%s)"
git checkout -b "$BRANCH_NAME"
log "info" "Created branch: $BRANCH_NAME"

# Run Claude Code
log "info" "Starting Claude Code"
echo "{\"type\":\"status\",\"data\":{\"status\":\"running\"}}"

# Create a temporary file for Claude output
OUTPUT_FILE=$(mktemp)
RESULT_FILE=$(mktemp)

# Run Claude Code with the prompt
timeout "${TIMEOUT:-300}" claude \
  --dangerously-skip-permissions \
  --model "${MODEL:-claude-sonnet-4-5}" \
  --max-turns "${MAX_TURNS:-10}" \
  --output-format stream-json \
  -p "$PROMPT" 2>&1 | while IFS= read -r line; do
    # Forward Claude's output as structured events
    if echo "$line" | jq -e . >/dev/null 2>&1; then
      # Valid JSON from Claude
      TYPE=$(echo "$line" | jq -r '.type // "message"')
      echo "{\"type\":\"$TYPE\",\"data\":$line}"
    else
      # Plain text
      echo "{\"type\":\"log\",\"data\":{\"message\":$(echo "$line" | jq -Rs .)}}"
    fi
  done || {
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 124 ]; then
      log "error" "Task timed out"
      exit 124
    fi
  }

# Collect results
log "info" "Collecting results"

# Get git diff
DIFF=$(git diff HEAD~0 2>/dev/null || echo "")
FILES_CHANGED=$(git diff --stat HEAD~0 2>/dev/null || echo "")

# Count commits made
COMMIT_COUNT=$(git rev-list --count HEAD ^HEAD~10 2>/dev/null || echo "0")

# Get file changes as JSON
FILES_JSON=$(git diff --numstat HEAD~0 2>/dev/null | while read adds dels file; do
  echo "{\"path\":\"$file\",\"additions\":$adds,\"deletions\":$dels}"
done | jq -s '.' || echo "[]")

# Build result
RESULT=$(jq -n \
  --arg success "true" \
  --arg summary "Task completed" \
  --argjson files "$FILES_JSON" \
  --arg diff "$DIFF" \
  '{
    success: ($success == "true"),
    summary: $summary,
    filesChanged: $files,
    diff: $diff,
    usage: {inputTokens: 0, outputTokens: 0}
  }')

echo "{\"type\":\"result\",\"data\":$RESULT}"
log "info" "Task completed successfully"
```

---

### 6. Testing

#### 6.1 Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "miniflare",
    environmentOptions: {
      modules: true,
      kvNamespaces: ["TASKS", "API_KEYS", "RATE_LIMITS"],
      r2Buckets: ["ARTIFACTS"],
    },
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/types/**"],
    },
  },
});
```

#### 6.2 Unit Tests

```typescript
// test/unit/auth.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createExecutionContext, env } from "cloudflare:test";
import app from "../../src/index";

describe("Authentication", () => {
  beforeEach(async () => {
    // Seed test API key
    const keyHash = await hashKey("test-api-key-123");
    await env.API_KEYS.put(
      keyHash,
      JSON.stringify({
        id: "key_test",
        name: "Test Key",
        keyHash,
        createdAt: new Date().toISOString(),
        rateLimit: 100,
        enabled: true,
      }),
    );
  });

  it("rejects requests without API key", async () => {
    const res = await app.fetch(new Request("http://localhost/v1/tasks"), env);
    expect(res.status).toBe(401);
  });

  it("rejects invalid API key", async () => {
    const res = await app.fetch(
      new Request("http://localhost/v1/tasks", {
        headers: { Authorization: "Bearer invalid-key" },
      }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("accepts valid API key", async () => {
    const res = await app.fetch(
      new Request("http://localhost/v1/tasks", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-api-key-123",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: "Test prompt",
          repository: { url: "https://github.com/test/repo.git" },
          claude: { apiKey: "sk-ant-test" },
        }),
      }),
      env,
    );
    // Should fail validation, not auth
    expect(res.status).not.toBe(401);
  });
});
```

#### 6.3 Integration Tests

```typescript
// test/integration/tasks.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import app from "../../src/index";

describe("Tasks API", () => {
  const validPayload = {
    prompt: "Add a README file",
    repository: {
      url: "https://github.com/test/repo.git",
      branch: "main",
    },
    claude: {
      apiKey: "sk-ant-api03-test-key",
      model: "claude-sonnet-4-5",
    },
    output: {
      mode: "async",
    },
  };

  beforeEach(async () => {
    // Setup test API key
    const keyHash = await hashKey("test-key");
    await env.API_KEYS.put(
      keyHash,
      JSON.stringify({
        id: "test",
        enabled: true,
        rateLimit: 100,
      }),
    );
  });

  it("creates async task and returns 202", async () => {
    const res = await app.fetch(
      new Request("http://localhost/v1/tasks", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validPayload),
      }),
      env,
    );

    expect(res.status).toBe(202);

    const body = await res.json();
    expect(body).toHaveProperty("taskId");
    expect(body.status).toBe("pending");
  });

  it("validates repository URL", async () => {
    const res = await app.fetch(
      new Request("http://localhost/v1/tasks", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validPayload,
          repository: { url: "https://malicious-site.com/repo.git" },
        }),
      }),
      env,
    );

    expect(res.status).toBe(400);
  });

  it("retrieves task by ID", async () => {
    // Create task
    const createRes = await app.fetch(
      new Request("http://localhost/v1/tasks", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validPayload),
      }),
      env,
    );

    const { taskId } = await createRes.json();

    // Get task
    const getRes = await app.fetch(
      new Request(`http://localhost/v1/tasks/${taskId}`, {
        headers: { Authorization: "Bearer test-key" },
      }),
      env,
    );

    expect(getRes.status).toBe(200);
    const task = await getRes.json();
    expect(task.id).toBe(taskId);
  });
});
```

#### 6.4 E2E Tests

```typescript
// test/e2e/full-flow.test.ts
import { describe, it, expect } from "vitest";

// E2E tests run against deployed staging environment
const BASE_URL =
  process.env.STAGING_URL || "https://helios-staging.getelysium.workers.dev";
const API_KEY = process.env.STAGING_API_KEY;

describe.skipIf(!API_KEY)("E2E: Full Task Flow", () => {
  it("creates task, streams output, and completes", async () => {
    // Create task
    const createRes = await fetch(`${BASE_URL}/v1/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: "List the files in this repository",
        repository: {
          url: "https://github.com/anthropics/anthropic-cookbook.git",
          branch: "main",
        },
        claude: {
          apiKey: process.env.ANTHROPIC_API_KEY,
          model: "claude-sonnet-4-5",
          maxTurns: 3,
        },
        output: { mode: "sync" },
      }),
    });

    expect(createRes.status).toBe(200);
    expect(createRes.headers.get("content-type")).toContain(
      "text/event-stream",
    );

    // Read SSE stream
    const reader = createRes.body!.getReader();
    const decoder = new TextDecoder();
    const events: any[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          events.push(JSON.parse(line.slice(6)));
        }
      }
    }

    // Verify we got expected events
    expect(events.some((e) => e.status === "running")).toBe(true);
    expect(
      events.some((e) => e.status === "completed" || e.success !== undefined),
    ).toBe(true);
  }, 120000); // 2 minute timeout
});
```

---

### 7. CI/CD

#### 7.1 CI Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - run: npm ci
      - run: npm test -- --coverage

      - uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./coverage/coverage-final.json

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - run: npm ci
      - run: npm run build

      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
```

#### 7.2 Deploy Staging

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy Staging

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - run: npm ci
      - run: npm run build

      # Build and push container image
      - name: Build Container
        run: |
          cd container
          docker build -t helios-claude-runner:latest .

      # Deploy to Cloudflare
      - name: Deploy Worker
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          environment: staging

      # Run E2E tests against staging
      - name: E2E Tests
        run: npm run test:e2e
        env:
          STAGING_URL: https://helios-staging.getelysium.workers.dev
          STAGING_API_KEY: ${{ secrets.STAGING_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

#### 7.3 Deploy Production

```yaml
# .github/workflows/deploy-prod.yml
name: Deploy Production

on:
  release:
    types: [published]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - run: npm ci
      - run: npm test
      - run: npm run build

      # Deploy to Cloudflare Production
      - name: Deploy Worker
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          environment: production

      # Notify
      - name: Notify Slack
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Helios deployed to production: ${{ github.event.release.tag_name }}"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

---

### 8. Scripts

#### 8.1 Setup Script

```typescript
// scripts/setup.ts
import { execSync } from "child_process";

async function setup() {
  console.log("Setting up Helios...\n");

  // Create KV namespaces
  console.log("Creating KV namespaces...");
  execSync("wrangler kv:namespace create TASKS", { stdio: "inherit" });
  execSync("wrangler kv:namespace create API_KEYS", { stdio: "inherit" });
  execSync("wrangler kv:namespace create RATE_LIMITS", { stdio: "inherit" });

  // Create R2 bucket
  console.log("\nCreating R2 bucket...");
  execSync("wrangler r2 bucket create helios-artifacts", { stdio: "inherit" });

  // Create queue
  console.log("\nCreating queue...");
  execSync("wrangler queues create helios-tasks", { stdio: "inherit" });

  console.log("\nSetup complete! Update wrangler.toml with the IDs above.");
}

setup().catch(console.error);
```

#### 8.2 Seed API Keys

```typescript
// scripts/seed-api-keys.ts
import { randomBytes, createHash } from "crypto";

async function seedApiKeys() {
  const wrangler = await import("wrangler");

  // Generate a test API key
  const apiKey = `hlx_${randomBytes(24).toString("base64url")}`;
  const keyHash = createHash("sha256").update(apiKey).digest("hex");

  const keyData = {
    id: "key_test_001",
    name: "Test API Key",
    keyHash,
    createdAt: new Date().toISOString(),
    rateLimit: 60, // 60 requests per minute
    enabled: true,
  };

  // Store in KV
  console.log("Storing API key in KV...");
  // Use wrangler CLI to put the key

  console.log("\n=== TEST API KEY ===");
  console.log(`API Key: ${apiKey}`);
  console.log("Store this securely - it cannot be retrieved later!");
  console.log("====================\n");
}

seedApiKeys().catch(console.error);
```

---

### 9. Package.json

```json
{
  "name": "helios",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "build": "wrangler deploy --dry-run --outdir=dist",
    "deploy": "wrangler deploy",
    "deploy:staging": "wrangler deploy --env staging",
    "deploy:prod": "wrangler deploy --env production",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "vitest run test/e2e",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit",
    "setup": "tsx scripts/setup.ts",
    "seed-keys": "tsx scripts/seed-api-keys.ts"
  },
  "dependencies": {
    "hono": "^4.0.0",
    "zod": "^3.22.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250101.0",
    "@cloudflare/vitest-pool-workers": "^0.1.0",
    "@types/node": "^20.0.0",
    "@types/uuid": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^8.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "wrangler": "^3.100.0"
  }
}
```

---

## Timeline & Milestones

### Week 1: Foundation

- [x] Project setup (wrangler, TypeScript, deps)
- [x] Core types and schemas
- [x] Auth and rate limiting middleware
- [x] Health endpoint
- [x] CI pipeline (lint, typecheck, unit tests)

### Week 2: Task API

- [x] Create task endpoint (async mode)
- [x] Get task status endpoint
- [x] KV storage for tasks
- [x] Queue integration
- [x] Integration tests

### Week 3: Container & Streaming

- [x] Container Dockerfile
- [x] Entrypoint script
- [x] Container integration with Worker
- [x] SSE streaming for sync mode
- [x] R2 storage for artifacts

### Week 4: Polish & Deploy

- [x] Cancel task endpoint
- [x] Logs and diff endpoints
- [x] E2E tests
- [x] Staging deployment
- [x] Documentation
- [x] Production deployment

---

## Local Development

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev

# Run tests
npm test

# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:prod
```

---

## Environment Variables

Set these via `wrangler secret put`:

```bash
wrangler secret put WEBHOOK_SIGNING_KEY
```

For CI/CD, add these to GitHub Secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `STAGING_API_KEY`
- `ANTHROPIC_API_KEY` (for E2E tests)
