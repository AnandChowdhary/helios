"""Type definitions for the Helios SDK."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional


# Type aliases
TaskStatus = Literal["pending", "running", "completed", "failed", "cancelled"]
ClaudeModel = Literal["claude-sonnet-4-5", "claude-opus-4"]
OutputMode = Literal["sync", "async"]
SSEEventType = Literal[
    "status", "message", "tool_use", "tool_result", "complete", "error", "log"
]


@dataclass
class RepositoryCredentials:
    """Repository credentials for authentication."""

    type: Literal["token"]
    value: str


@dataclass
class Repository:
    """Repository configuration."""

    url: str
    """Git repository URL (must be GitHub, GitLab, or Bitbucket)."""
    branch: Optional[str] = "main"
    """Branch to clone (defaults to 'main')."""
    credentials: Optional[RepositoryCredentials] = None
    """Git credentials for private repositories."""


@dataclass
class ClaudeConfig:
    """Claude configuration."""

    api_key: str
    """Anthropic API key (must start with 'sk-ant-')."""
    model: ClaudeModel = "claude-sonnet-4-5"
    """Claude model to use (defaults to 'claude-sonnet-4-5')."""
    max_turns: int = 10
    """Maximum conversation turns (1-50, defaults to 10)."""
    system_prompt: Optional[str] = None
    """Custom system prompt."""


@dataclass
class TaskOptions:
    """Task execution options."""

    timeout: int = 300
    """Timeout in seconds (30-600, defaults to 300)."""
    allowed_tools: Optional[List[str]] = None
    """Allowed Claude Code tools."""
    working_directory: str = "/workspace"
    """Working directory in container."""
    environment: Optional[Dict[str, str]] = None
    """Environment variables."""


@dataclass
class WebhookConfig:
    """Webhook configuration for async tasks."""

    url: str
    """Webhook URL to call on completion."""
    secret: str
    """Secret for HMAC signature (min 16 chars)."""


@dataclass
class OutputConfig:
    """Output configuration."""

    mode: OutputMode = "sync"
    """Execution mode."""
    webhook: Optional[WebhookConfig] = None
    """Webhook configuration for notifications."""


@dataclass
class FileChange:
    """File change information."""

    path: str
    """File path."""
    additions: int
    """Number of lines added."""
    deletions: int
    """Number of lines deleted."""


@dataclass
class TokenUsage:
    """Token usage information."""

    input_tokens: int
    """Input tokens consumed."""
    output_tokens: int
    """Output tokens generated."""


@dataclass
class TaskResult:
    """Task result."""

    success: bool
    """Whether the task succeeded."""
    summary: str
    """Summary of what was done."""
    files_changed: List[FileChange]
    """Files that were modified."""
    usage: TokenUsage
    """Token usage."""
    diff: Optional[str] = None
    """Git diff of all changes."""


@dataclass
class RepositoryInfo:
    """Repository info in task response."""

    url: str
    branch: str


@dataclass
class Task:
    """Task object."""

    id: str
    """Unique task ID."""
    status: TaskStatus
    """Current status."""
    prompt: str
    """Original prompt."""
    repository: RepositoryInfo
    """Repository info."""
    created_at: str
    """When the task was created."""
    started_at: Optional[str] = None
    """When the task started running."""
    completed_at: Optional[str] = None
    """When the task completed."""
    result: Optional[TaskResult] = None
    """Task result (if completed)."""
    error: Optional[str] = None
    """Error message (if failed)."""
    container_id: Optional[str] = None
    """Container ID."""


@dataclass
class AsyncTaskResponse:
    """Response from creating an async task."""

    task_id: str
    """Task ID."""
    status: Literal["pending"]
    """Initial status."""
    created_at: str
    """Creation timestamp."""
    status_url: str
    """URL to check status."""


@dataclass
class CancelTaskResponse:
    """Response from cancelling a task."""

    task_id: str
    """Task ID."""
    status: Literal["cancelled"]
    """New status."""
    cancelled_at: str
    """When cancelled."""


@dataclass
class PullRequestInfo:
    """Pull request information."""

    url: str
    """PR URL."""
    number: int
    """PR number."""


@dataclass
class PushTaskResponse:
    """Response from pushing changes."""

    task_id: str
    """Task ID."""
    success: bool
    """Whether push succeeded."""
    branch: Optional[str] = None
    """Branch pushed to."""
    message: Optional[str] = None
    """Success/error message."""
    error: Optional[str] = None
    """Error details."""
    pull_request: Optional[PullRequestInfo] = None
    """Pull request info (if created)."""
    pull_request_error: Optional[str] = None
    """PR creation error (if PR failed but push succeeded)."""


@dataclass
class SSEEvent:
    """SSE event."""

    event: SSEEventType
    """Event type."""
    data: Any
    """Event data."""


@dataclass
class RetryConfig:
    """Retry configuration for automatic exponential backoff."""

    max_retries: int = 3
    """Maximum number of retry attempts (default: 3)."""
    initial_delay_ms: int = 1000
    """Initial delay in milliseconds before first retry (default: 1000)."""
    max_delay_ms: int = 10000
    """Maximum delay in milliseconds between retries (default: 10000)."""
    backoff_multiplier: float = 2.0
    """Backoff multiplier (default: 2)."""
    retry_on_rate_limit: bool = True
    """Whether to retry on rate limit errors (429) (default: True)."""


@dataclass
class HeliosConfig:
    """Helios client configuration."""

    api_key: str
    """Helios API key."""
    base_url: str = "https://helios.getelysium.workers.dev"
    """Base URL (defaults to production)."""
    retry: Optional[RetryConfig] = None
    """Retry configuration for transient failures. Set to RetryConfig() to enable with defaults, or None to disable."""


@dataclass
class CreateAsyncTaskInput:
    """Input for creating an async task."""

    prompt: str
    """The prompt/instruction for Claude."""
    repository: Repository
    """Repository to clone and work on."""
    claude: ClaudeConfig
    """Claude configuration including API key."""
    options: Optional[TaskOptions] = None
    """Task execution options."""
    webhook: Optional[WebhookConfig] = None
    """Webhook configuration for completion notifications."""


@dataclass
class CreateStreamTaskInput:
    """Input for creating a sync/streaming task."""

    prompt: str
    """The prompt/instruction for Claude."""
    repository: Repository
    """Repository to clone and work on."""
    claude: ClaudeConfig
    """Claude configuration including API key."""
    options: Optional[TaskOptions] = None
    """Task execution options."""


@dataclass
class PushTaskInput:
    """Input for pushing changes."""

    branch: str
    """Branch name to push to."""
    credentials: RepositoryCredentials
    """Git credentials for pushing."""
    create_pr: bool = False
    """Whether to create a PR (GitHub only)."""
    pr_title: Optional[str] = None
    """PR title (if create_pr is True)."""
    pr_body: Optional[str] = None
    """PR body (if create_pr is True)."""


@dataclass
class ListTasksOptions:
    """Options for listing tasks."""

    limit: int = 20
    """Maximum number of tasks to return (1-100, defaults to 20)."""
    offset: int = 0
    """Number of tasks to skip (defaults to 0)."""
    status: Optional[TaskStatus] = None
    """Filter by task status."""


@dataclass
class TaskListPagination:
    """Pagination information for task listing."""

    total: int
    """Total number of tasks matching the filter."""
    limit: int
    """Limit used in the query."""
    offset: int
    """Offset used in the query."""
    has_more: bool
    """Whether there are more tasks to fetch."""


@dataclass
class TaskListResponse:
    """Response from listing tasks."""

    tasks: List[Task]
    """Array of tasks."""
    pagination: TaskListPagination
    """Pagination information."""


@dataclass
class RateLimitInfo:
    """Rate limit information."""

    limit: int
    """Maximum requests allowed per minute."""
    current: int
    """Number of requests made in current window."""
    remaining: int
    """Requests remaining in current window."""
    reset_at: str
    """ISO timestamp when limit resets."""
    reset_at_unix: int
    """Unix timestamp (ms) when limit resets."""
    window_ms: int
    """Window duration in milliseconds."""


@dataclass
class ConcurrentTasksInfo:
    """Concurrent tasks information."""

    limit: int
    """Maximum concurrent tasks allowed."""
    active: int
    """Currently active tasks."""
    remaining: int
    """Available concurrent task slots."""


@dataclass
class RateLimitResponse:
    """Response from the rate limit endpoint."""

    rate_limit: RateLimitInfo
    """Request rate limit information."""
    concurrent_tasks: ConcurrentTasksInfo
    """Concurrent task limit information."""
