# Helios TypeScript SDK

Official TypeScript/JavaScript SDK for the Helios Cloud Claude Code API.

## Installation

```bash
npm install @helios-sdk/typescript
```

## Quick Start

```typescript
import { HeliosClient } from "@helios-sdk/typescript";

const client = new HeliosClient({
  apiKey: "your-helios-api-key",
});

// Create an async task
const task = await client.createTaskAsync({
  prompt: "Fix the failing tests in the auth module",
  repository: {
    url: "https://github.com/user/repo.git",
    branch: "main",
    credentials: {
      type: "token",
      value: "ghp_xxx", // GitHub token for private repos
    },
  },
  claude: {
    apiKey: "sk-ant-xxx", // Your Anthropic API key
    model: "claude-sonnet-4-5",
    maxTurns: 10,
  },
});

console.log(`Task created: ${task.taskId}`);

// Wait for completion
const result = await client.waitForTask(task.taskId);
console.log(`Task ${result.status}: ${result.result?.summary}`);
```

## Streaming Responses

For real-time output, use `createTaskStream`:

```typescript
const events = client.createTaskStream({
  prompt: "Add comprehensive tests to the utils module",
  repository: { url: "https://github.com/user/repo.git" },
  claude: { apiKey: "sk-ant-xxx" },
});

for await (const event of events) {
  switch (event.event) {
    case "status":
      console.log("Status:", event.data);
      break;
    case "message":
      console.log("Claude:", event.data);
      break;
    case "tool_use":
      console.log("Tool:", event.data);
      break;
    case "complete":
      console.log("Complete:", event.data);
      break;
    case "error":
      console.error("Error:", event.data);
      break;
  }
}
```

## Push Changes & Create PRs

After a task completes, push changes to a new branch and create a PR:

```typescript
const pushResult = await client.pushTaskChanges(task.taskId, {
  branch: "claude/fix-auth-tests",
  credentials: {
    type: "token",
    value: "ghp_xxx",
  },
  createPR: true,
  prTitle: "Fix failing auth tests",
  prBody: "This PR fixes the failing tests in the authentication module.",
});

if (pushResult.pullRequest) {
  console.log(`PR created: ${pushResult.pullRequest.url}`);
}
```

## API Reference

### `HeliosClient`

#### Constructor

```typescript
new HeliosClient(config: HeliosConfig)
```

- `apiKey` (required): Your Helios API key
- `baseUrl` (optional): API base URL (defaults to production)

#### Methods

##### `createTaskAsync(input)`

Create a task that runs asynchronously. Returns immediately with task ID.

##### `createTaskStream(input)`

Create a task with SSE streaming. Returns an async iterator of events.

##### `getTask(taskId)`

Get task status and results.

##### `cancelTask(taskId)`

Cancel a running or pending task.

##### `getTaskLogs(taskId)`

Get execution logs for a task.

##### `getTaskDiff(taskId)`

Get the git diff of all changes made.

##### `pushTaskChanges(taskId, input)`

Push changes to remote repository and optionally create a PR.

##### `waitForTask(taskId, options?)`

Poll until task completes. Options:

- `intervalMs`: Polling interval (default: 1000ms)
- `timeoutMs`: Timeout (default: 600000ms / 10 min)
- `onPoll`: Callback for each poll

### Error Handling

All methods throw `HeliosError` on failure:

```typescript
import { HeliosError } from "@helios-sdk/typescript";

try {
  await client.getTask("nonexistent");
} catch (error) {
  if (error instanceof HeliosError) {
    console.error(`Error: ${error.message} (status: ${error.status})`);
  }
}
```

## Types

The SDK exports all TypeScript types:

```typescript
import type {
  Task,
  TaskStatus,
  CreateTaskInput,
  TaskResult,
  SSEEvent,
  // ... etc
} from "@helios-sdk/typescript";
```

## License

MIT
