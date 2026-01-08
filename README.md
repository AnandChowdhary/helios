# Helios

**Cloud Claude Code API Service** — Run Claude Code instances on-demand through a simple REST API.

Helios is a developer API service that provides on-demand Claude Code instances in the cloud. Developers can programmatically spin up isolated containers, clone repositories, execute Claude Code tasks, and retrieve results — all through a simple REST API.

Think of it as **"Claude Code as a Service"** — the same powerful agentic coding assistant, but accessible via API for automation, CI/CD pipelines, and building AI-powered developer tools.

## Use Cases

- **Automated Code Review** — Trigger Claude Code to review PRs on push
- **Bug Fixing Pipelines** — Submit issues and get back code fixes
- **Code Generation** — Generate features from natural language specs
- **Refactoring at Scale** — Batch process repositories for migrations
- **Developer Tools** — Build IDE plugins, Slack bots, or CLI tools powered by Claude Code

## Features

- 🚀 **Simple API** — One endpoint to run a task, one to check status
- 📡 **Streaming Support** — Real-time output via Server-Sent Events (SSE)
- 🔐 **Credential Passthrough** — API keys passed per-request, never stored
- 📦 **Isolated Execution** — Each task runs in its own ephemeral container
- 🌐 **Edge Deployment** — Runs on Cloudflare Workers for global low-latency

## Tech Stack

| Component     | Technology                      |
| ------------- | ------------------------------- |
| Runtime       | Cloudflare Workers              |
| Containers    | Cloudflare Containers           |
| Database      | Cloudflare KV (task metadata)   |
| Storage       | Cloudflare R2 (logs, artifacts) |
| Rate Limiting | Cloudflare Rate Limiting API    |
| Queue         | Cloudflare Queues               |
| Framework     | Hono                            |
| Validation    | Zod                             |
| Language      | TypeScript                      |

## Quick Start

### Prerequisites

- Node.js 22+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Cloudflare account

### Installation

```bash
# Clone the repository
git clone https://github.com/AnandChowdhary/helios.git
cd helios

# Install dependencies
npm install

# Start local development server
npm run dev
```

### Configuration

Copy `wrangler.toml.example` to `wrangler.toml` and update with your Cloudflare resource IDs:

```toml
name = "helios"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "TASKS"
id = "<your-tasks-kv-id>"

[[kv_namespaces]]
binding = "API_KEYS"
id = "<your-api-keys-kv-id>"

[[r2_buckets]]
binding = "ARTIFACTS"
bucket_name = "helios-artifacts"
```

## API Reference

### Authentication

All endpoints under `/v1/*` require authentication via API key in the Authorization header:

```
Authorization: Bearer <HELIOS_API_KEY>
```

### Base URL

```
https://helios.example.com
```

---

### Create Task

Creates a new Claude Code task to execute against a repository.

```http
POST /v1/tasks
```

#### Request Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `prompt` | string | Yes | - | The task prompt (1-100,000 characters) |
| `repository.url` | string | Yes | - | Git repository URL (GitHub, GitLab, or Bitbucket) |
| `repository.branch` | string | No | `main` | Branch to clone |
| `repository.credentials.type` | string | No | - | Authentication type (`token`) |
| `repository.credentials.value` | string | No | - | Authentication token (e.g., `ghp_xxx`) |
| `claude.apiKey` | string | Yes | - | Anthropic API key (must start with `sk-ant-`) |
| `claude.model` | string | No | `claude-sonnet-4-5` | Model to use (`claude-sonnet-4-5` or `claude-opus-4`) |
| `claude.maxTurns` | number | No | `10` | Maximum conversation turns (1-50) |
| `claude.systemPrompt` | string | No | - | Custom system prompt (max 10,000 characters) |
| `options.timeout` | number | No | `300` | Task timeout in seconds (30-600) |
| `options.allowedTools` | string[] | No | `["Read", "Write", "Bash", "Glob", "Grep"]` | Claude Code tools to allow |
| `options.workingDirectory` | string | No | `/workspace` | Working directory in container |
| `options.environment` | object | No | - | Environment variables to set |
| `output.mode` | string | No | `sync` | Output mode (`sync` or `async`) |
| `output.webhook.url` | string | No | - | Webhook URL for async notifications |
| `output.webhook.secret` | string | No | - | Webhook HMAC secret (min 16 characters) |

#### Example: Async Task (curl)

```bash
curl -X POST https://helios.example.com/v1/tasks \
  -H "Authorization: Bearer $HELIOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Fix the failing tests in the auth module",
    "repository": {
      "url": "https://github.com/user/repo.git",
      "branch": "main",
      "credentials": {
        "type": "token",
        "value": "'"$GITHUB_TOKEN"'"
      }
    },
    "claude": {
      "apiKey": "'"$ANTHROPIC_API_KEY"'",
      "model": "claude-sonnet-4-5",
      "maxTurns": 10
    },
    "output": {
      "mode": "async"
    }
  }'
```

**Response (202 Accepted):**

```json
{
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "createdAt": "2025-01-08T10:00:00.000Z",
  "statusUrl": "https://helios.example.com/v1/tasks/550e8400-e29b-41d4-a716-446655440000"
}
```

#### Example: Sync Task with SSE Streaming (curl)

```bash
curl -X POST https://helios.example.com/v1/tasks \
  -H "Authorization: Bearer $HELIOS_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "prompt": "List all TypeScript files and count the lines of code",
    "repository": {
      "url": "https://github.com/user/repo.git"
    },
    "claude": {
      "apiKey": "'"$ANTHROPIC_API_KEY"'",
      "maxTurns": 5
    },
    "output": {
      "mode": "sync"
    }
  }'
```

**Response (200 OK, SSE Stream):**

```
event: status
data: {"status":"starting","taskId":"550e8400-e29b-41d4-a716-446655440000"}

event: status
data: {"status":"running","taskId":"550e8400-e29b-41d4-a716-446655440000"}

event: message
data: {"type":"assistant","content":"I'll search for TypeScript files..."}

event: tool_use
data: {"tool":"Glob","input":{"pattern":"**/*.ts"}}

event: complete
data: {"success":true,"summary":"Found 42 TypeScript files with 3,500 lines of code"}
```

---

### Get Task Status

Retrieve the current status and result of a task.

```http
GET /v1/tasks/:taskId
```

#### Example (curl)

```bash
curl https://helios.example.com/v1/tasks/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer $HELIOS_API_KEY"
```

**Response (200 OK):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "prompt": "Fix the failing tests",
  "repository": {
    "url": "https://github.com/user/repo.git",
    "branch": "main"
  },
  "createdAt": "2025-01-08T10:00:00.000Z",
  "startedAt": "2025-01-08T10:00:05.000Z",
  "completedAt": "2025-01-08T10:02:30.000Z",
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
    "diff": "diff --git a/src/auth/login.ts..."
  }
}
```

---

### Cancel Task

Cancel a pending or running task.

```http
POST /v1/tasks/:taskId/cancel
```

#### Example (curl)

```bash
curl -X POST https://helios.example.com/v1/tasks/550e8400-e29b-41d4-a716-446655440000/cancel \
  -H "Authorization: Bearer $HELIOS_API_KEY"
```

**Response (200 OK):**

```json
{
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "cancelled",
  "cancelledAt": "2025-01-08T10:01:00.000Z"
}
```

---

### Get Task Logs

Retrieve the full execution logs for a completed task.

```http
GET /v1/tasks/:taskId/logs
```

#### Example (curl)

```bash
curl https://helios.example.com/v1/tasks/550e8400-e29b-41d4-a716-446655440000/logs \
  -H "Authorization: Bearer $HELIOS_API_KEY"
```

**Response (200 OK, text/plain):**

```
[2025-01-08T10:00:05.000Z] Starting task...
[2025-01-08T10:00:06.000Z] Cloning repository...
[2025-01-08T10:00:10.000Z] Running Claude Code...
...
```

---

### Get Task Diff

Retrieve the git diff of all changes made by the task.

```http
GET /v1/tasks/:taskId/diff
```

#### Example (curl)

```bash
curl https://helios.example.com/v1/tasks/550e8400-e29b-41d4-a716-446655440000/diff \
  -H "Authorization: Bearer $HELIOS_API_KEY"
```

**Response (200 OK, text/x-diff):**

```diff
diff --git a/src/auth/login.ts b/src/auth/login.ts
index abc123..def456 100644
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -10,5 +10,7 @@ export function login(user: string, pass: string) {
+  // Validate input before processing
+  if (!user || !pass) throw new Error('Invalid credentials');
   return authenticate(user, pass);
 }
```

---

### Health Check

Check if the API is healthy (no authentication required).

```http
GET /health
```

#### Example (curl)

```bash
curl https://helios.example.com/health
```

**Response (200 OK):**

```json
{
  "status": "healthy",
  "timestamp": "2025-01-08T10:00:00.000Z"
}
```

---

## Task Status Values

| Status | Description |
|--------|-------------|
| `pending` | Task is queued and waiting to start |
| `running` | Task is currently executing |
| `completed` | Task finished successfully |
| `failed` | Task finished with an error |
| `cancelled` | Task was cancelled by the user |

---

## Error Responses

All error responses follow this format:

```json
{
  "error": {
    "message": "Description of the error"
  }
}
```

### HTTP Status Codes

| Status | Description |
|--------|-------------|
| `200` | Success |
| `202` | Accepted (async task created) |
| `400` | Bad Request - Invalid input or task cannot be cancelled |
| `401` | Unauthorized - Missing or invalid API key |
| `404` | Not Found - Task or resource not found |
| `429` | Too Many Requests - Rate limit exceeded |
| `500` | Internal Server Error |

### Rate Limiting

Rate limits are applied per API key. When rate limited, the response includes these headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1704708000000
```

---

## SSE Event Types

When using sync mode, the response is a Server-Sent Events stream with these event types:

| Event | Description |
|-------|-------------|
| `status` | Task status updates (`starting`, `running`) |
| `message` | Claude's text responses |
| `tool_use` | Tool invocation by Claude |
| `tool_result` | Result from tool execution |
| `complete` | Task completed with final result |
| `error` | Error occurred during execution |

---

## Code Examples

### TypeScript/JavaScript

#### Create an Async Task

```typescript
const response = await fetch('https://helios.example.com/v1/tasks', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.HELIOS_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    prompt: 'Add unit tests for the auth module',
    repository: {
      url: 'https://github.com/user/repo.git',
      branch: 'main',
      credentials: {
        type: 'token',
        value: process.env.GITHUB_TOKEN,
      },
    },
    claude: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-sonnet-4-5',
      maxTurns: 15,
    },
    output: {
      mode: 'async',
    },
  }),
});

const { taskId, statusUrl } = await response.json();
console.log(`Task created: ${taskId}`);
console.log(`Check status at: ${statusUrl}`);
```

#### Poll for Task Completion

```typescript
async function waitForTask(taskId: string): Promise<any> {
  const maxAttempts = 60;
  const pollInterval = 5000; // 5 seconds

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `https://helios.example.com/v1/tasks/${taskId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.HELIOS_API_KEY}`,
        },
      }
    );

    const task = await response.json();

    if (task.status === 'completed' || task.status === 'failed') {
      return task;
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Task timed out');
}

const result = await waitForTask(taskId);
console.log(`Task ${result.status}:`, result.result?.summary);
```

#### Stream Sync Task with EventSource

```typescript
// Note: EventSource doesn't support custom headers in browsers.
// Use fetch with ReadableStream for full control.

async function streamTask(taskPayload: object) {
  const response = await fetch('https://helios.example.com/v1/tasks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.HELIOS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...taskPayload,
      output: { mode: 'sync' },
    }),
  });

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = 'message';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7);
      } else if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        console.log(`[${currentEvent}]`, data);

        if (currentEvent === 'complete') {
          return data;
        }
        if (currentEvent === 'error') {
          throw new Error(data.message);
        }
      }
    }
  }
}
```

#### Simple Wrapper Class

```typescript
class HeliosClient {
  constructor(
    private apiKey: string,
    private baseUrl = 'https://helios.example.com'
  ) {}

  async createTask(options: {
    prompt: string;
    repoUrl: string;
    branch?: string;
    githubToken?: string;
    anthropicApiKey: string;
    async?: boolean;
  }) {
    const response = await fetch(`${this.baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: options.prompt,
        repository: {
          url: options.repoUrl,
          branch: options.branch ?? 'main',
          credentials: options.githubToken
            ? { type: 'token', value: options.githubToken }
            : undefined,
        },
        claude: {
          apiKey: options.anthropicApiKey,
        },
        output: {
          mode: options.async ? 'async' : 'sync',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message ?? 'Request failed');
    }

    return response.json();
  }

  async getTask(taskId: string) {
    const response = await fetch(`${this.baseUrl}/v1/tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message ?? 'Request failed');
    }

    return response.json();
  }

  async cancelTask(taskId: string) {
    const response = await fetch(`${this.baseUrl}/v1/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message ?? 'Request failed');
    }

    return response.json();
  }
}

// Usage
const helios = new HeliosClient(process.env.HELIOS_API_KEY!);

const { taskId } = await helios.createTask({
  prompt: 'Refactor the utils module to use TypeScript',
  repoUrl: 'https://github.com/user/repo.git',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  async: true,
});

// Later...
const task = await helios.getTask(taskId);
```

---

## Development

```bash
# Start local development server
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Type check
npm run typecheck
```

## Deployment

```bash
# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:prod
```

### Setting Secrets

```bash
wrangler secret put WEBHOOK_SIGNING_KEY
```

## Project Structure

```
helios/
├── src/
│   ├── index.ts              # Worker entry point
│   ├── routes/
│   │   └── tasks.ts          # Task API routes
│   ├── middleware/
│   │   ├── auth.ts           # API key authentication
│   │   ├── rateLimit.ts      # Rate limiting
│   │   └── validate.ts       # Request validation
│   ├── schemas/
│   │   └── task.ts           # Zod schemas
│   ├── types/
│   │   └── index.ts          # TypeScript types
│   └── utils/
│       └── errors.ts         # Error handling
├── test/
│   ├── unit/                 # Unit tests
│   └── integration/          # Integration tests
├── wrangler.toml             # Cloudflare configuration
├── vitest.config.ts          # Test configuration
└── package.json
```

## Security

- **Credentials are never stored** — API keys passed per-request, used once, discarded
- **Ephemeral containers** — Each task gets a fresh container, destroyed after completion
- **Network isolation** — Containers can only access allowed endpoints
- **Input validation** — All requests validated with Zod schemas
- **Rate limiting** — Per-API-key rate limits prevent abuse

## License

MIT © [Anand Chowdhary](https://anandchowdhary.com)
