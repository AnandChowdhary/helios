"""Helios SDK client for the Cloud Claude Code API."""

from __future__ import annotations

import json
import time
from typing import TYPE_CHECKING, Any, Callable, Dict, Iterator, List, Optional, Union

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

import httpx

from .types import (
    AsyncTaskResponse,
    CancelTaskResponse,
    CreateAsyncTaskInput,
    CreateStreamTaskInput,
    FileChange,
    HeliosConfig,
    ListTasksOptions,
    PullRequestInfo,
    PushTaskInput,
    PushTaskResponse,
    RepositoryInfo,
    SSEEvent,
    Task,
    TaskListPagination,
    TaskListResponse,
    TaskResult,
    TokenUsage,
)


class HeliosError(Exception):
    """Error thrown by the Helios SDK."""

    def __init__(
        self,
        message: str,
        status: Optional[int] = None,
        code: Optional[str] = None,
    ):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


def _build_payload(input_obj: Union[CreateAsyncTaskInput, CreateStreamTaskInput]) -> dict:
    """Build API payload from input object."""
    # Build repository dict
    repo_dict: Dict[str, Any] = {"url": input_obj.repository.url}
    if input_obj.repository.branch:
        repo_dict["branch"] = input_obj.repository.branch
    if input_obj.repository.credentials:
        repo_dict["credentials"] = {
            "type": input_obj.repository.credentials.type,
            "value": input_obj.repository.credentials.value,
        }

    # Build claude dict
    claude_dict: Dict[str, Any] = {"apiKey": input_obj.claude.api_key}
    if input_obj.claude.model:
        claude_dict["model"] = input_obj.claude.model
    if input_obj.claude.max_turns:
        claude_dict["maxTurns"] = input_obj.claude.max_turns
    if input_obj.claude.system_prompt:
        claude_dict["systemPrompt"] = input_obj.claude.system_prompt

    # Build options dict
    options_dict: Dict[str, Any] = {}
    if input_obj.options:
        if input_obj.options.timeout:
            options_dict["timeout"] = input_obj.options.timeout
        if input_obj.options.allowed_tools:
            options_dict["allowedTools"] = input_obj.options.allowed_tools
        if input_obj.options.working_directory:
            options_dict["workingDirectory"] = input_obj.options.working_directory
        if input_obj.options.environment:
            options_dict["environment"] = input_obj.options.environment

    payload: Dict[str, Any] = {
        "prompt": input_obj.prompt,
        "repository": repo_dict,
        "claude": claude_dict,
    }

    if options_dict:
        payload["options"] = options_dict

    return payload


def _parse_task(data: dict) -> Task:
    """Parse task data from API response."""
    result = None
    if data.get("result"):
        r = data["result"]
        files_changed = [
            FileChange(
                path=f.get("path", ""),
                additions=f.get("additions", 0),
                deletions=f.get("deletions", 0),
            )
            for f in r.get("filesChanged", [])
        ]
        usage = TokenUsage(
            input_tokens=r.get("usage", {}).get("inputTokens", 0),
            output_tokens=r.get("usage", {}).get("outputTokens", 0),
        )
        result = TaskResult(
            success=r.get("success", False),
            summary=r.get("summary", ""),
            files_changed=files_changed,
            usage=usage,
            diff=r.get("diff"),
        )

    repo = data.get("repository", {})
    return Task(
        id=data.get("id", ""),
        status=data.get("status", "pending"),
        prompt=data.get("prompt", ""),
        repository=RepositoryInfo(
            url=repo.get("url", ""),
            branch=repo.get("branch", "main"),
        ),
        created_at=data.get("createdAt", ""),
        started_at=data.get("startedAt"),
        completed_at=data.get("completedAt"),
        result=result,
        error=data.get("error"),
        container_id=data.get("containerId"),
    )


def _parse_task_list_response(data: dict) -> TaskListResponse:
    """Parse task list response from API."""
    tasks = [_parse_task(t) for t in data.get("tasks", [])]
    pagination_data = data.get("pagination", {})
    pagination = TaskListPagination(
        total=pagination_data.get("total", 0),
        limit=pagination_data.get("limit", 20),
        offset=pagination_data.get("offset", 0),
        has_more=pagination_data.get("hasMore", False),
    )
    return TaskListResponse(tasks=tasks, pagination=pagination)


def _parse_sse_lines(lines: List[str]) -> Iterator[SSEEvent]:
    """Parse SSE lines and yield events."""
    current_event = "message"
    for line in lines:
        if line.startswith("event: "):
            current_event = line[7:].strip()
        elif line.startswith("data: "):
            data_str = line[6:]
            try:
                data = json.loads(data_str)
            except json.JSONDecodeError:
                data = data_str
            yield SSEEvent(event=current_event, data=data)  # type: ignore


class HeliosClient:
    """Helios SDK client for interacting with the Cloud Claude Code API."""

    def __init__(self, config: HeliosConfig):
        """Create a new Helios client.

        Args:
            config: Client configuration with API key and optional base URL.
        """
        if not config.api_key:
            raise HeliosError("API key is required")
        self._api_key = config.api_key
        self._base_url = config.base_url.rstrip("/")
        self._client = httpx.Client(timeout=300.0)

    def __enter__(self) -> "HeliosClient":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()

    def close(self) -> None:
        """Close the HTTP client."""
        self._client.close()

    def _extract_error_message(self, response: httpx.Response) -> str:
        """Extract error message from a failed response."""
        try:
            error_data = response.json()
            if isinstance(error_data, dict) and "error" in error_data:
                if isinstance(error_data["error"], dict):
                    return error_data["error"].get(
                        "message", f"Request failed with status {response.status_code}"
                    )
                return str(error_data["error"])
        except Exception:
            pass
        return f"Request failed with status {response.status_code}"

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[dict] = None,
    ) -> Any:
        """Make an authenticated request to the API."""
        url = f"{self._base_url}{path}"
        headers = {"Authorization": f"Bearer {self._api_key}"}

        if body:
            headers["Content-Type"] = "application/json"

        response = self._client.request(
            method,
            url,
            headers=headers,
            json=body,
        )

        if not response.is_success:
            error_message = self._extract_error_message(response)
            raise HeliosError(error_message, response.status_code)

        return response.json()

    def _request_text(self, path: str) -> str:
        """Make an authenticated request that returns text."""
        url = f"{self._base_url}{path}"
        response = self._client.get(
            url,
            headers={"Authorization": f"Bearer {self._api_key}"},
        )

        if not response.is_success:
            error_message = self._extract_error_message(response)
            raise HeliosError(error_message, response.status_code)

        return response.text

    def create_task_async(self, input: CreateAsyncTaskInput) -> AsyncTaskResponse:
        """Create and run a task asynchronously.

        The task will be queued and processed in the background.
        Use `get_task()` to check status or configure a webhook to receive
        notifications.

        Args:
            input: Task configuration.

        Returns:
            Task ID and status URL.

        Example:
            >>> response = client.create_task_async(CreateAsyncTaskInput(
            ...     prompt="Fix the failing tests",
            ...     repository=Repository(
            ...         url="https://github.com/user/repo.git",
            ...         credentials=RepositoryCredentials(type="token", value="ghp_xxx"),
            ...     ),
            ...     claude=ClaudeConfig(api_key="sk-ant-xxx"),
            ... ))
            >>> print(f"Task created: {response.task_id}")
        """
        payload = _build_payload(input)

        # Add output mode
        output_config: Dict[str, Any] = {"mode": "async"}
        if input.webhook:
            output_config["webhook"] = {
                "url": input.webhook.url,
                "secret": input.webhook.secret,
            }
        payload["output"] = output_config

        data = self._request("POST", "/v1/tasks", payload)

        return AsyncTaskResponse(
            task_id=data.get("taskId", ""),
            status="pending",
            created_at=data.get("createdAt", ""),
            status_url=data.get("statusUrl", ""),
        )

    def create_task_stream(
        self, input: CreateStreamTaskInput
    ) -> Iterator[SSEEvent]:
        """Create and run a task synchronously with SSE streaming.

        Returns an iterator that yields events as the task executes.

        Args:
            input: Task configuration.

        Yields:
            SSE events as the task executes.

        Example:
            >>> for event in client.create_task_stream(CreateStreamTaskInput(
            ...     prompt="Add a README file",
            ...     repository=Repository(url="https://github.com/user/repo.git"),
            ...     claude=ClaudeConfig(api_key="sk-ant-xxx"),
            ... )):
            ...     print(event.event, event.data)
        """
        payload = _build_payload(input)
        payload["output"] = {"mode": "sync"}

        url = f"{self._base_url}/v1/tasks"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        with self._client.stream(
            "POST",
            url,
            headers=headers,
            json=payload,
        ) as response:
            if not response.is_success:
                # Read full response for error
                response.read()
                error_message = self._extract_error_message(response)
                raise HeliosError(error_message, response.status_code)

            buffer = ""
            for chunk in response.iter_text():
                buffer += chunk
                lines = buffer.split("\n")
                buffer = lines.pop()  # Keep incomplete line in buffer

                yield from _parse_sse_lines(lines)

            # Process remaining buffer
            if buffer.strip():
                yield from _parse_sse_lines(buffer.split("\n"))

    def get_task(self, task_id: str) -> Task:
        """Get task status and results.

        Args:
            task_id: Task ID to retrieve.

        Returns:
            Task object with status and results.

        Example:
            >>> task = client.get_task("task_abc123")
            >>> if task.status == "completed":
            ...     print(task.result.summary)
        """
        data = self._request("GET", f"/v1/tasks/{task_id}")
        return _parse_task(data)

    def list_tasks(
        self,
        options: Optional[ListTasksOptions] = None,
    ) -> TaskListResponse:
        """List tasks for the authenticated API key.

        Returns tasks in reverse chronological order (newest first).

        Args:
            options: Listing options (pagination and filtering).

        Returns:
            Task list with pagination info.

        Example:
            >>> # Get the first 10 tasks
            >>> result = client.list_tasks(ListTasksOptions(limit=10))
            >>> print(f"Found {result.pagination.total} tasks")
            >>>
            >>> # Filter by status
            >>> completed = client.list_tasks(ListTasksOptions(status="completed"))
            >>>
            >>> # Paginate through all tasks
            >>> offset = 0
            >>> while True:
            ...     page = client.list_tasks(ListTasksOptions(limit=20, offset=offset))
            ...     for task in page.tasks:
            ...         print(task.id, task.status)
            ...     if not page.pagination.has_more:
            ...         break
            ...     offset += len(page.tasks)
        """
        params: Dict[str, str] = {}
        if options:
            if options.limit != 20:
                params["limit"] = str(options.limit)
            if options.offset != 0:
                params["offset"] = str(options.offset)
            if options.status:
                params["status"] = options.status

        query_string = "&".join(f"{k}={v}" for k, v in params.items())
        path = f"/v1/tasks?{query_string}" if query_string else "/v1/tasks"

        data = self._request("GET", path)
        return _parse_task_list_response(data)

    def cancel_task(self, task_id: str) -> CancelTaskResponse:
        """Cancel a running or pending task.

        Args:
            task_id: Task ID to cancel.

        Returns:
            Cancellation confirmation.

        Example:
            >>> response = client.cancel_task("task_abc123")
            >>> print(f"Task cancelled at {response.cancelled_at}")
        """
        data = self._request("POST", f"/v1/tasks/{task_id}/cancel")
        return CancelTaskResponse(
            task_id=data.get("taskId", ""),
            status="cancelled",
            cancelled_at=data.get("cancelledAt", ""),
        )

    def get_task_logs(self, task_id: str) -> str:
        """Get task logs.

        Args:
            task_id: Task ID.

        Returns:
            Log content as text.

        Example:
            >>> logs = client.get_task_logs("task_abc123")
            >>> print(logs)
        """
        return self._request_text(f"/v1/tasks/{task_id}/logs")

    def get_task_diff(self, task_id: str) -> str:
        """Get task diff (git diff of all changes).

        Args:
            task_id: Task ID.

        Returns:
            Diff content as text.

        Example:
            >>> diff = client.get_task_diff("task_abc123")
            >>> print(diff)
        """
        return self._request_text(f"/v1/tasks/{task_id}/diff")

    def push_task_changes(
        self, task_id: str, input: PushTaskInput
    ) -> PushTaskResponse:
        """Push task changes to remote repository.

        Only works for completed tasks. Can optionally create a pull request.

        Args:
            task_id: Task ID.
            input: Push configuration.

        Returns:
            Push result.

        Example:
            >>> result = client.push_task_changes("task_abc123", PushTaskInput(
            ...     branch="claude/fix-tests",
            ...     credentials=RepositoryCredentials(type="token", value="ghp_xxx"),
            ...     create_pr=True,
            ...     pr_title="Fix failing tests",
            ...     pr_body="This PR fixes the failing tests.",
            ... ))
            >>> if result.pull_request:
            ...     print(f"PR created: {result.pull_request.url}")
        """
        payload: Dict[str, Any] = {
            "branch": input.branch,
            "credentials": {
                "type": input.credentials.type,
                "value": input.credentials.value,
            },
        }
        if input.create_pr:
            payload["createPR"] = input.create_pr
        if input.pr_title:
            payload["prTitle"] = input.pr_title
        if input.pr_body:
            payload["prBody"] = input.pr_body

        data = self._request("POST", f"/v1/tasks/{task_id}/push", payload)

        pull_request = None
        if data.get("pullRequest"):
            pr = data["pullRequest"]
            pull_request = PullRequestInfo(
                url=pr.get("url", ""),
                number=pr.get("number", 0),
            )

        return PushTaskResponse(
            task_id=data.get("taskId", ""),
            success=data.get("success", False),
            branch=data.get("branch"),
            message=data.get("message"),
            error=data.get("error"),
            pull_request=pull_request,
            pull_request_error=data.get("pullRequestError"),
        )

    def wait_for_task(
        self,
        task_id: str,
        *,
        interval_ms: int = 1000,
        timeout_ms: int = 600000,
        on_poll: Optional[Callable[[Task], None]] = None,
    ) -> Task:
        """Poll for task completion.

        Convenience method that polls `get_task()` until the task completes
        or fails.

        Args:
            task_id: Task ID to poll.
            interval_ms: Polling interval in milliseconds (default: 1000).
            timeout_ms: Timeout in milliseconds (default: 600000 = 10 min).
            on_poll: Callback for each poll.

        Returns:
            Completed task.

        Example:
            >>> task = client.wait_for_task(
            ...     "task_abc123",
            ...     interval_ms=2000,
            ...     timeout_ms=300000,
            ... )
            >>> print(f"Task {task.status}: {task.result.summary}")
        """
        start_time = time.time() * 1000

        while True:
            task = self.get_task(task_id)

            if on_poll:
                on_poll(task)

            if task.status in ("completed", "failed", "cancelled"):
                return task

            elapsed = time.time() * 1000 - start_time
            if elapsed > timeout_ms:
                raise HeliosError(
                    f"Timeout waiting for task {task_id}",
                    code="TIMEOUT",
                )

            time.sleep(interval_ms / 1000)


class AsyncHeliosClient:
    """Async Helios SDK client for interacting with the Cloud Claude Code API."""

    def __init__(self, config: HeliosConfig):
        """Create a new async Helios client.

        Args:
            config: Client configuration with API key and optional base URL.
        """
        if not config.api_key:
            raise HeliosError("API key is required")
        self._api_key = config.api_key
        self._base_url = config.base_url.rstrip("/")
        self._client = httpx.AsyncClient(timeout=300.0)

    async def __aenter__(self) -> "AsyncHeliosClient":
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        await self.close()

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()

    def _extract_error_message(self, response: httpx.Response) -> str:
        """Extract error message from a failed response."""
        try:
            error_data = response.json()
            if isinstance(error_data, dict) and "error" in error_data:
                if isinstance(error_data["error"], dict):
                    return error_data["error"].get(
                        "message", f"Request failed with status {response.status_code}"
                    )
                return str(error_data["error"])
        except Exception:
            pass
        return f"Request failed with status {response.status_code}"

    async def _request(
        self,
        method: str,
        path: str,
        body: Optional[dict] = None,
    ) -> Any:
        """Make an authenticated request to the API."""
        url = f"{self._base_url}{path}"
        headers = {"Authorization": f"Bearer {self._api_key}"}

        if body:
            headers["Content-Type"] = "application/json"

        response = await self._client.request(
            method,
            url,
            headers=headers,
            json=body,
        )

        if not response.is_success:
            error_message = self._extract_error_message(response)
            raise HeliosError(error_message, response.status_code)

        return response.json()

    async def _request_text(self, path: str) -> str:
        """Make an authenticated request that returns text."""
        url = f"{self._base_url}{path}"
        response = await self._client.get(
            url,
            headers={"Authorization": f"Bearer {self._api_key}"},
        )

        if not response.is_success:
            error_message = self._extract_error_message(response)
            raise HeliosError(error_message, response.status_code)

        return response.text

    async def create_task_async(
        self, input: CreateAsyncTaskInput
    ) -> AsyncTaskResponse:
        """Create and run a task asynchronously.

        The task will be queued and processed in the background.
        Use `get_task()` to check status or configure a webhook to receive
        notifications.

        Args:
            input: Task configuration.

        Returns:
            Task ID and status URL.
        """
        payload = _build_payload(input)

        output_config: Dict[str, Any] = {"mode": "async"}
        if input.webhook:
            output_config["webhook"] = {
                "url": input.webhook.url,
                "secret": input.webhook.secret,
            }
        payload["output"] = output_config

        data = await self._request("POST", "/v1/tasks", payload)

        return AsyncTaskResponse(
            task_id=data.get("taskId", ""),
            status="pending",
            created_at=data.get("createdAt", ""),
            status_url=data.get("statusUrl", ""),
        )

    async def create_task_stream(
        self, input: CreateStreamTaskInput
    ) -> AsyncIterator[SSEEvent]:
        """Create and run a task synchronously with SSE streaming.

        Returns an async iterator that yields events as the task executes.

        Args:
            input: Task configuration.

        Yields:
            SSE events as the task executes.
        """
        payload = _build_payload(input)
        payload["output"] = {"mode": "sync"}

        url = f"{self._base_url}/v1/tasks"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        async with self._client.stream(
            "POST",
            url,
            headers=headers,
            json=payload,
        ) as response:
            if not response.is_success:
                await response.aread()
                error_message = self._extract_error_message(response)
                raise HeliosError(error_message, response.status_code)

            buffer = ""
            async for chunk in response.aiter_text():
                buffer += chunk
                lines = buffer.split("\n")
                buffer = lines.pop()

                for event in _parse_sse_lines(lines):
                    yield event

            if buffer.strip():
                for event in _parse_sse_lines(buffer.split("\n")):
                    yield event

    async def get_task(self, task_id: str) -> Task:
        """Get task status and results.

        Args:
            task_id: Task ID to retrieve.

        Returns:
            Task object with status and results.
        """
        data = await self._request("GET", f"/v1/tasks/{task_id}")
        return _parse_task(data)

    async def list_tasks(
        self,
        options: Optional[ListTasksOptions] = None,
    ) -> TaskListResponse:
        """List tasks for the authenticated API key.

        Returns tasks in reverse chronological order (newest first).

        Args:
            options: Listing options (pagination and filtering).

        Returns:
            Task list with pagination info.
        """
        params: Dict[str, str] = {}
        if options:
            if options.limit != 20:
                params["limit"] = str(options.limit)
            if options.offset != 0:
                params["offset"] = str(options.offset)
            if options.status:
                params["status"] = options.status

        query_string = "&".join(f"{k}={v}" for k, v in params.items())
        path = f"/v1/tasks?{query_string}" if query_string else "/v1/tasks"

        data = await self._request("GET", path)
        return _parse_task_list_response(data)

    async def cancel_task(self, task_id: str) -> CancelTaskResponse:
        """Cancel a running or pending task.

        Args:
            task_id: Task ID to cancel.

        Returns:
            Cancellation confirmation.
        """
        data = await self._request("POST", f"/v1/tasks/{task_id}/cancel")
        return CancelTaskResponse(
            task_id=data.get("taskId", ""),
            status="cancelled",
            cancelled_at=data.get("cancelledAt", ""),
        )

    async def get_task_logs(self, task_id: str) -> str:
        """Get task logs.

        Args:
            task_id: Task ID.

        Returns:
            Log content as text.
        """
        return await self._request_text(f"/v1/tasks/{task_id}/logs")

    async def get_task_diff(self, task_id: str) -> str:
        """Get task diff (git diff of all changes).

        Args:
            task_id: Task ID.

        Returns:
            Diff content as text.
        """
        return await self._request_text(f"/v1/tasks/{task_id}/diff")

    async def push_task_changes(
        self, task_id: str, input: PushTaskInput
    ) -> PushTaskResponse:
        """Push task changes to remote repository.

        Only works for completed tasks. Can optionally create a pull request.

        Args:
            task_id: Task ID.
            input: Push configuration.

        Returns:
            Push result.
        """
        payload: Dict[str, Any] = {
            "branch": input.branch,
            "credentials": {
                "type": input.credentials.type,
                "value": input.credentials.value,
            },
        }
        if input.create_pr:
            payload["createPR"] = input.create_pr
        if input.pr_title:
            payload["prTitle"] = input.pr_title
        if input.pr_body:
            payload["prBody"] = input.pr_body

        data = await self._request("POST", f"/v1/tasks/{task_id}/push", payload)

        pull_request = None
        if data.get("pullRequest"):
            pr = data["pullRequest"]
            pull_request = PullRequestInfo(
                url=pr.get("url", ""),
                number=pr.get("number", 0),
            )

        return PushTaskResponse(
            task_id=data.get("taskId", ""),
            success=data.get("success", False),
            branch=data.get("branch"),
            message=data.get("message"),
            error=data.get("error"),
            pull_request=pull_request,
            pull_request_error=data.get("pullRequestError"),
        )

    async def wait_for_task(
        self,
        task_id: str,
        *,
        interval_ms: int = 1000,
        timeout_ms: int = 600000,
        on_poll: Optional[Callable[[Task], None]] = None,
    ) -> Task:
        """Poll for task completion.

        Convenience method that polls `get_task()` until the task completes
        or fails.

        Args:
            task_id: Task ID to poll.
            interval_ms: Polling interval in milliseconds (default: 1000).
            timeout_ms: Timeout in milliseconds (default: 600000 = 10 min).
            on_poll: Callback for each poll.

        Returns:
            Completed task.
        """
        import asyncio

        start_time = time.time() * 1000

        while True:
            task = await self.get_task(task_id)

            if on_poll:
                on_poll(task)

            if task.status in ("completed", "failed", "cancelled"):
                return task

            elapsed = time.time() * 1000 - start_time
            if elapsed > timeout_ms:
                raise HeliosError(
                    f"Timeout waiting for task {task_id}",
                    code="TIMEOUT",
                )

            await asyncio.sleep(interval_ms / 1000)
