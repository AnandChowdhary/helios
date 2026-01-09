"""Tests for the Helios SDK client."""

import json
from unittest.mock import MagicMock

import httpx
import pytest
import respx

from helios_sdk import (
    AsyncHeliosClient,
    ClaudeConfig,
    CreateAsyncTaskInput,
    CreateStreamTaskInput,
    HeliosClient,
    HeliosConfig,
    HeliosError,
    PushTaskInput,
    Repository,
    RepositoryCredentials,
)


BASE_URL = "https://test.helios.dev"


class TestHeliosClientInit:
    """Tests for HeliosClient initialization."""

    def test_requires_api_key(self):
        """Should raise error if API key is missing."""
        with pytest.raises(HeliosError, match="API key is required"):
            HeliosClient(HeliosConfig(api_key=""))

    def test_accepts_valid_config(self):
        """Should accept valid configuration."""
        client = HeliosClient(HeliosConfig(api_key="test-key", base_url=BASE_URL))
        assert client._api_key == "test-key"
        assert client._base_url == BASE_URL

    def test_strips_trailing_slash_from_base_url(self):
        """Should strip trailing slash from base URL."""
        client = HeliosClient(HeliosConfig(api_key="test-key", base_url=f"{BASE_URL}/"))
        assert client._base_url == BASE_URL


class TestCreateTaskAsync:
    """Tests for create_task_async method."""

    @respx.mock
    def test_creates_async_task(self):
        """Should create an async task successfully."""
        route = respx.post(f"{BASE_URL}/v1/tasks").mock(
            return_value=httpx.Response(
                202,
                json={
                    "taskId": "task_123",
                    "status": "pending",
                    "createdAt": "2025-01-08T10:00:00Z",
                    "statusUrl": f"{BASE_URL}/v1/tasks/task_123",
                },
            )
        )

        client = HeliosClient(HeliosConfig(api_key="test-key", base_url=BASE_URL))
        response = client.create_task_async(
            CreateAsyncTaskInput(
                prompt="Fix the tests",
                repository=Repository(url="https://github.com/test/repo.git"),
                claude=ClaudeConfig(api_key="sk-ant-test"),
            )
        )

        assert response.task_id == "task_123"
        assert response.status == "pending"
        assert route.called

        # Verify request payload
        request = route.calls[0].request
        payload = json.loads(request.content)
        assert payload["prompt"] == "Fix the tests"
        assert payload["output"]["mode"] == "async"

    @respx.mock
    def test_includes_webhook_config(self):
        """Should include webhook configuration in request."""
        from helios_sdk import WebhookConfig

        route = respx.post(f"{BASE_URL}/v1/tasks").mock(
            return_value=httpx.Response(
                202,
                json={
                    "taskId": "task_123",
                    "status": "pending",
                    "createdAt": "2025-01-08T10:00:00Z",
                    "statusUrl": f"{BASE_URL}/v1/tasks/task_123",
                },
            )
        )

        client = HeliosClient(HeliosConfig(api_key="test-key", base_url=BASE_URL))
        client.create_task_async(
            CreateAsyncTaskInput(
                prompt="Test",
                repository=Repository(url="https://github.com/test/repo.git"),
                claude=ClaudeConfig(api_key="sk-ant-test"),
                webhook=WebhookConfig(
                    url="https://webhook.example.com",
                    secret="super-secret-key-123",
                ),
            )
        )

        request = route.calls[0].request
        payload = json.loads(request.content)
        assert payload["output"]["webhook"]["url"] == "https://webhook.example.com"


class TestGetTask:
    """Tests for get_task method."""

    @respx.mock
    def test_gets_task(self):
        """Should get task by ID."""
        respx.get(f"{BASE_URL}/v1/tasks/task_123").mock(
            return_value=httpx.Response(
                200,
                json={
                    "id": "task_123",
                    "status": "completed",
                    "prompt": "Fix tests",
                    "repository": {
                        "url": "https://github.com/test/repo.git",
                        "branch": "main",
                    },
                    "createdAt": "2025-01-08T10:00:00Z",
                    "completedAt": "2025-01-08T10:05:00Z",
                    "result": {
                        "success": True,
                        "summary": "Fixed 3 tests",
                        "filesChanged": [
                            {"path": "test.py", "additions": 10, "deletions": 5}
                        ],
                        "usage": {"inputTokens": 1000, "outputTokens": 500},
                    },
                },
            )
        )

        client = HeliosClient(HeliosConfig(api_key="test-key", base_url=BASE_URL))
        task = client.get_task("task_123")

        assert task.id == "task_123"
        assert task.status == "completed"
        assert task.result is not None
        assert task.result.success is True
        assert task.result.summary == "Fixed 3 tests"
        assert len(task.result.files_changed) == 1

    @respx.mock
    def test_handles_not_found(self):
        """Should raise error for non-existent task."""
        respx.get(f"{BASE_URL}/v1/tasks/nonexistent").mock(
            return_value=httpx.Response(
                404,
                json={"error": {"message": "Task not found"}},
            )
        )

        client = HeliosClient(HeliosConfig(api_key="test-key", base_url=BASE_URL))

        with pytest.raises(HeliosError) as exc_info:
            client.get_task("nonexistent")

        assert exc_info.value.status == 404
        assert "Task not found" in exc_info.value.message


class TestCancelTask:
    """Tests for cancel_task method."""

    @respx.mock
    def test_cancels_task(self):
        """Should cancel a running task."""
        respx.post(f"{BASE_URL}/v1/tasks/task_123/cancel").mock(
            return_value=httpx.Response(
                200,
                json={
                    "taskId": "task_123",
                    "status": "cancelled",
                    "cancelledAt": "2025-01-08T10:02:00Z",
                },
            )
        )

        client = HeliosClient(HeliosConfig(api_key="test-key", base_url=BASE_URL))
        response = client.cancel_task("task_123")

        assert response.task_id == "task_123"
        assert response.status == "cancelled"


class TestGetTaskLogs:
    """Tests for get_task_logs method."""

    @respx.mock
    def test_gets_logs(self):
        """Should get task logs."""
        respx.get(f"{BASE_URL}/v1/tasks/task_123/logs").mock(
            return_value=httpx.Response(
                200,
                text="[INFO] Starting task...\n[INFO] Task completed",
            )
        )

        client = HeliosClient(HeliosConfig(api_key="test-key", base_url=BASE_URL))
        logs = client.get_task_logs("task_123")

        assert "Starting task" in logs
        assert "Task completed" in logs


class TestGetTaskDiff:
    """Tests for get_task_diff method."""

    @respx.mock
    def test_gets_diff(self):
        """Should get task diff."""
        diff_content = "diff --git a/test.py b/test.py\n+new line"
        respx.get(f"{BASE_URL}/v1/tasks/task_123/diff").mock(
            return_value=httpx.Response(200, text=diff_content)
        )

        client = HeliosClient(HeliosConfig(api_key="test-key", base_url=BASE_URL))
        diff = client.get_task_diff("task_123")

        assert diff == diff_content


class TestPushTaskChanges:
    """Tests for push_task_changes method."""

    @respx.mock
    def test_pushes_changes(self):
        """Should push changes to remote."""
        respx.post(f"{BASE_URL}/v1/tasks/task_123/push").mock(
            return_value=httpx.Response(
                200,
                json={
                    "taskId": "task_123",
                    "success": True,
                    "branch": "claude/fix-tests",
                    "message": "Changes pushed successfully",
                },
            )
        )

        client = HeliosClient(HeliosConfig(api_key="test-key", base_url=BASE_URL))
        response = client.push_task_changes(
            "task_123",
            PushTaskInput(
                branch="claude/fix-tests",
                credentials=RepositoryCredentials(type="token", value="ghp_test"),
            ),
        )

        assert response.success is True
        assert response.branch == "claude/fix-tests"

    @respx.mock
    def test_pushes_with_pr(self):
        """Should push changes and create PR."""
        respx.post(f"{BASE_URL}/v1/tasks/task_123/push").mock(
            return_value=httpx.Response(
                200,
                json={
                    "taskId": "task_123",
                    "success": True,
                    "branch": "claude/fix-tests",
                    "pullRequest": {
                        "url": "https://github.com/test/repo/pull/1",
                        "number": 1,
                    },
                },
            )
        )

        client = HeliosClient(HeliosConfig(api_key="test-key", base_url=BASE_URL))
        response = client.push_task_changes(
            "task_123",
            PushTaskInput(
                branch="claude/fix-tests",
                credentials=RepositoryCredentials(type="token", value="ghp_test"),
                create_pr=True,
                pr_title="Fix tests",
                pr_body="This PR fixes the tests",
            ),
        )

        assert response.pull_request is not None
        assert response.pull_request.number == 1


class TestWaitForTask:
    """Tests for wait_for_task method."""

    @respx.mock
    def test_waits_for_completion(self):
        """Should poll until task completes."""
        call_count = 0

        def response_callback(request):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                return httpx.Response(
                    200,
                    json={
                        "id": "task_123",
                        "status": "running",
                        "prompt": "Test",
                        "repository": {"url": "https://github.com/test/repo.git", "branch": "main"},
                        "createdAt": "2025-01-08T10:00:00Z",
                    },
                )
            return httpx.Response(
                200,
                json={
                    "id": "task_123",
                    "status": "completed",
                    "prompt": "Test",
                    "repository": {"url": "https://github.com/test/repo.git", "branch": "main"},
                    "createdAt": "2025-01-08T10:00:00Z",
                    "result": {
                        "success": True,
                        "summary": "Done",
                        "filesChanged": [],
                        "usage": {"inputTokens": 100, "outputTokens": 50},
                    },
                },
            )

        respx.get(f"{BASE_URL}/v1/tasks/task_123").mock(side_effect=response_callback)

        client = HeliosClient(HeliosConfig(api_key="test-key", base_url=BASE_URL))
        task = client.wait_for_task("task_123", interval_ms=10)

        assert task.status == "completed"
        assert call_count == 3

    @respx.mock
    def test_calls_on_poll_callback(self):
        """Should call on_poll callback for each poll."""
        respx.get(f"{BASE_URL}/v1/tasks/task_123").mock(
            return_value=httpx.Response(
                200,
                json={
                    "id": "task_123",
                    "status": "completed",
                    "prompt": "Test",
                    "repository": {"url": "https://github.com/test/repo.git", "branch": "main"},
                    "createdAt": "2025-01-08T10:00:00Z",
                    "result": {
                        "success": True,
                        "summary": "Done",
                        "filesChanged": [],
                        "usage": {"inputTokens": 100, "outputTokens": 50},
                    },
                },
            )
        )

        callback = MagicMock()
        client = HeliosClient(HeliosConfig(api_key="test-key", base_url=BASE_URL))
        client.wait_for_task("task_123", on_poll=callback)

        callback.assert_called_once()

    @respx.mock
    def test_raises_on_timeout(self):
        """Should raise error on timeout."""
        respx.get(f"{BASE_URL}/v1/tasks/task_123").mock(
            return_value=httpx.Response(
                200,
                json={
                    "id": "task_123",
                    "status": "running",
                    "prompt": "Test",
                    "repository": {"url": "https://github.com/test/repo.git", "branch": "main"},
                    "createdAt": "2025-01-08T10:00:00Z",
                },
            )
        )

        client = HeliosClient(HeliosConfig(api_key="test-key", base_url=BASE_URL))

        with pytest.raises(HeliosError) as exc_info:
            client.wait_for_task("task_123", interval_ms=10, timeout_ms=50)

        assert "Timeout" in exc_info.value.message
        assert exc_info.value.code == "TIMEOUT"


class TestCreateTaskStream:
    """Tests for create_task_stream method."""

    @respx.mock
    def test_streams_events(self):
        """Should stream SSE events."""
        sse_content = (
            "event: status\n"
            'data: {"status": "running"}\n\n'
            "event: message\n"
            'data: {"content": "Hello"}\n\n'
            "event: complete\n"
            'data: {"success": true}\n\n'
        )

        respx.post(f"{BASE_URL}/v1/tasks").mock(
            return_value=httpx.Response(
                200,
                content=sse_content.encode(),
                headers={"content-type": "text/event-stream"},
            )
        )

        client = HeliosClient(HeliosConfig(api_key="test-key", base_url=BASE_URL))
        events = list(
            client.create_task_stream(
                CreateStreamTaskInput(
                    prompt="Test",
                    repository=Repository(url="https://github.com/test/repo.git"),
                    claude=ClaudeConfig(api_key="sk-ant-test"),
                )
            )
        )

        assert len(events) == 3
        assert events[0].event == "status"
        assert events[1].event == "message"
        assert events[2].event == "complete"


class TestAsyncHeliosClient:
    """Tests for AsyncHeliosClient."""

    @pytest.mark.asyncio
    @respx.mock
    async def test_creates_async_task(self):
        """Should create an async task."""
        respx.post(f"{BASE_URL}/v1/tasks").mock(
            return_value=httpx.Response(
                202,
                json={
                    "taskId": "task_123",
                    "status": "pending",
                    "createdAt": "2025-01-08T10:00:00Z",
                    "statusUrl": f"{BASE_URL}/v1/tasks/task_123",
                },
            )
        )

        async with AsyncHeliosClient(
            HeliosConfig(api_key="test-key", base_url=BASE_URL)
        ) as client:
            response = await client.create_task_async(
                CreateAsyncTaskInput(
                    prompt="Test",
                    repository=Repository(url="https://github.com/test/repo.git"),
                    claude=ClaudeConfig(api_key="sk-ant-test"),
                )
            )

        assert response.task_id == "task_123"

    @pytest.mark.asyncio
    @respx.mock
    async def test_gets_task(self):
        """Should get task by ID."""
        respx.get(f"{BASE_URL}/v1/tasks/task_123").mock(
            return_value=httpx.Response(
                200,
                json={
                    "id": "task_123",
                    "status": "completed",
                    "prompt": "Test",
                    "repository": {"url": "https://github.com/test/repo.git", "branch": "main"},
                    "createdAt": "2025-01-08T10:00:00Z",
                },
            )
        )

        async with AsyncHeliosClient(
            HeliosConfig(api_key="test-key", base_url=BASE_URL)
        ) as client:
            task = await client.get_task("task_123")

        assert task.id == "task_123"


class TestErrorHandling:
    """Tests for error handling."""

    @respx.mock
    def test_handles_auth_error(self):
        """Should handle 401 authentication error."""
        respx.get(f"{BASE_URL}/v1/tasks/task_123").mock(
            return_value=httpx.Response(
                401,
                json={"error": {"message": "Invalid API key"}},
            )
        )

        client = HeliosClient(HeliosConfig(api_key="invalid-key", base_url=BASE_URL))

        with pytest.raises(HeliosError) as exc_info:
            client.get_task("task_123")

        assert exc_info.value.status == 401

    @respx.mock
    def test_handles_rate_limit(self):
        """Should handle 429 rate limit error."""
        respx.get(f"{BASE_URL}/v1/tasks/task_123").mock(
            return_value=httpx.Response(
                429,
                json={"error": {"message": "Rate limit exceeded"}},
            )
        )

        client = HeliosClient(HeliosConfig(api_key="test-key", base_url=BASE_URL))

        with pytest.raises(HeliosError) as exc_info:
            client.get_task("task_123")

        assert exc_info.value.status == 429
