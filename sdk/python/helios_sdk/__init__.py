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
    OutputConfig,
    OutputMode,
    PullRequestInfo,
    PushTaskInput,
    PushTaskResponse,
    Repository,
    RepositoryCredentials,
    RepositoryInfo,
    SSEEvent,
    SSEEventType,
    Task,
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
