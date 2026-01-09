"""Helios SDK - Python client for the Cloud Claude Code API."""

from .client import AsyncHeliosClient, HeliosClient, HeliosError
from .types import (
    AsyncTaskResponse,
    CancelTaskResponse,
    ClaudeConfig,
    ClaudeModel,
    CreateAsyncTaskInput,
    CreateStreamTaskInput,
    FileChange,
    HeliosConfig,
    ListTasksOptions,
    OutputConfig,
    OutputMode,
    PullRequestInfo,
    PushTaskInput,
    PushTaskResponse,
    Repository,
    RepositoryCredentials,
    RepositoryInfo,
    RetryConfig,
    SSEEvent,
    SSEEventType,
    Task,
    TaskListPagination,
    TaskListResponse,
    TaskOptions,
    TaskResult,
    TaskStatus,
    TokenUsage,
    WebhookConfig,
)

__version__ = "0.1.0"

__all__ = [
    # Clients
    "HeliosClient",
    "AsyncHeliosClient",
    "HeliosError",
    # Config
    "HeliosConfig",
    "RetryConfig",
    # Task creation
    "CreateAsyncTaskInput",
    "CreateStreamTaskInput",
    "Repository",
    "RepositoryCredentials",
    "ClaudeConfig",
    "ClaudeModel",
    "TaskOptions",
    "OutputConfig",
    "OutputMode",
    "WebhookConfig",
    # Task results
    "Task",
    "TaskStatus",
    "TaskResult",
    "FileChange",
    "TokenUsage",
    "RepositoryInfo",
    # Task listing
    "ListTasksOptions",
    "TaskListPagination",
    "TaskListResponse",
    # Async responses
    "AsyncTaskResponse",
    "CancelTaskResponse",
    # Push
    "PushTaskInput",
    "PushTaskResponse",
    "PullRequestInfo",
    # Streaming
    "SSEEvent",
    "SSEEventType",
]
