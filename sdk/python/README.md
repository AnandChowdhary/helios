# Helios Python SDK

Official Python SDK for the Helios Cloud Claude Code API.

## Installation

```bash
pip install helios-sdk
```

## Quick Start

```python
from helios_sdk import (
    HeliosClient,
    HeliosConfig,
    CreateAsyncTaskInput,
    Repository,
    RepositoryCredentials,
    ClaudeConfig,
)

client = HeliosClient(HeliosConfig(
    api_key="your-helios-api-key",
))

# Create an async task
response = client.create_task_async(CreateAsyncTaskInput(
    prompt="Fix the failing tests in the auth module",
    repository=Repository(
        url="https://github.com/user/repo.git",
        branch="main",
        credentials=RepositoryCredentials(
            type="token",
            value="ghp_xxx",  # GitHub token for private repos
        ),
    ),
    claude=ClaudeConfig(
        api_key="sk-ant-xxx",  # Your Anthropic API key
        model="claude-sonnet-4-5",
        max_turns=10,
    ),
))

print(f"Task created: {response.task_id}")

# Wait for completion
result = client.wait_for_task(response.task_id)
print(f"Task {result.status}: {result.result.summary if result.result else ''}")
```

## Streaming Responses

For real-time output, use `create_task_stream`:

```python
from helios_sdk import (
    HeliosClient,
    HeliosConfig,
    CreateStreamTaskInput,
    Repository,
    ClaudeConfig,
)

client = HeliosClient(HeliosConfig(api_key="your-helios-api-key"))

for event in client.create_task_stream(CreateStreamTaskInput(
    prompt="Add comprehensive tests to the utils module",
    repository=Repository(url="https://github.com/user/repo.git"),
    claude=ClaudeConfig(api_key="sk-ant-xxx"),
)):
    if event.event == "status":
        print("Status:", event.data)
    elif event.event == "message":
        print("Claude:", event.data)
    elif event.event == "tool_use":
        print("Tool:", event.data)
    elif event.event == "complete":
        print("Complete:", event.data)
    elif event.event == "error":
        print("Error:", event.data)
```

## Async Client

For async/await usage:

```python
import asyncio
from helios_sdk import (
    AsyncHeliosClient,
    HeliosConfig,
    CreateAsyncTaskInput,
    Repository,
    ClaudeConfig,
)

async def main():
    async with AsyncHeliosClient(HeliosConfig(api_key="your-api-key")) as client:
        response = await client.create_task_async(CreateAsyncTaskInput(
            prompt="Fix the bug",
            repository=Repository(url="https://github.com/user/repo.git"),
            claude=ClaudeConfig(api_key="sk-ant-xxx"),
        ))

        task = await client.wait_for_task(response.task_id)
        print(f"Task {task.status}")

asyncio.run(main())
```

## Push Changes & Create PRs

After a task completes, push changes to a new branch and create a PR:

```python
from helios_sdk import PushTaskInput, RepositoryCredentials

result = client.push_task_changes(
    task.task_id,
    PushTaskInput(
        branch="claude/fix-auth-tests",
        credentials=RepositoryCredentials(
            type="token",
            value="ghp_xxx",
        ),
        create_pr=True,
        pr_title="Fix failing auth tests",
        pr_body="This PR fixes the failing tests in the authentication module.",
    ),
)

if result.pull_request:
    print(f"PR created: {result.pull_request.url}")
```

## API Reference

### `HeliosClient` / `AsyncHeliosClient`

#### Constructor

```python
HeliosClient(config: HeliosConfig)
AsyncHeliosClient(config: HeliosConfig)
```

- `api_key` (required): Your Helios API key
- `base_url` (optional): API base URL (defaults to production)

#### Methods

##### `create_task_async(input)`

Create a task that runs asynchronously. Returns immediately with task ID.

##### `create_task_stream(input)`

Create a task with SSE streaming. Returns an iterator of events.

##### `get_task(task_id)`

Get task status and results.

##### `cancel_task(task_id)`

Cancel a running or pending task.

##### `get_task_logs(task_id)`

Get execution logs for a task.

##### `get_task_diff(task_id)`

Get the git diff of all changes made.

##### `push_task_changes(task_id, input)`

Push changes to remote repository and optionally create a PR.

##### `wait_for_task(task_id, **options)`

Poll until task completes. Options:

- `interval_ms`: Polling interval (default: 1000ms)
- `timeout_ms`: Timeout (default: 600000ms / 10 min)
- `on_poll`: Callback for each poll

### Error Handling

All methods raise `HeliosError` on failure:

```python
from helios_sdk import HeliosError

try:
    client.get_task("nonexistent")
except HeliosError as e:
    print(f"Error: {e.message} (status: {e.status})")
```

## Types

The SDK exports all types for type hints:

```python
from helios_sdk import (
    Task,
    TaskStatus,
    CreateAsyncTaskInput,
    TaskResult,
    SSEEvent,
    # ... etc
)
```

## Requirements

- Python 3.10+
- httpx

## License

MIT
