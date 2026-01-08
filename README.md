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

All requests require authentication via API key:

```
Authorization: Bearer <HELIOS_API_KEY>
```

### Create Task

```http
POST /v1/tasks
```

**Request Body:**

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
    "allowedTools": ["Read", "Write", "Bash", "Glob", "Grep"]
  },
  "output": {
    "mode": "async"
  }
}
```

**Response (Async Mode — 202 Accepted):**

```json
{
  "taskId": "task_abc123",
  "status": "pending",
  "createdAt": "2025-01-08T10:00:00Z",
  "statusUrl": "https://api.helios.dev/v1/tasks/task_abc123"
}
```

**Response (Sync Mode — SSE Stream):**

```
HTTP/1.1 200 OK
Content-Type: text/event-stream

event: status
data: {"status": "running", "taskId": "task_abc123"}

event: message
data: {"type": "assistant", "content": "I'll start by reading the test files..."}

event: complete
data: {"status": "completed", "result": {...}}
```

### Get Task Status

```http
GET /v1/tasks/:taskId
```

**Response:**

```json
{
  "taskId": "task_abc123",
  "status": "completed",
  "createdAt": "2025-01-08T10:00:00Z",
  "completedAt": "2025-01-08T10:02:30Z",
  "result": {
    "success": true,
    "summary": "Fixed 3 failing tests in auth module",
    "filesChanged": [
      {
        "path": "src/auth/login.ts",
        "additions": 12,
        "deletions": 5
      }
    ]
  }
}
```

### Cancel Task

```http
POST /v1/tasks/:taskId/cancel
```

**Response:**

```json
{
  "taskId": "task_abc123",
  "status": "cancelled",
  "cancelledAt": "2025-01-08T10:01:00Z"
}
```

### Get Task Logs

```http
GET /v1/tasks/:taskId/logs
```

Returns the full execution logs as plain text.

### Get Task Diff

```http
GET /v1/tasks/:taskId/diff
```

Returns the git diff of all changes made.

### Health Check

```http
GET /health
```

Returns the API health status (no authentication required).

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
