import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from nanobot.heartbeat.service import HeartbeatService


@pytest.fixture
def mock_provider():
    """Create a mock LLM provider."""
    provider = MagicMock()
    provider.chat = AsyncMock()
    return provider


@pytest.fixture
def heartbeat_service(tmp_path, mock_provider):
    """Create a HeartbeatService with mocked dependencies."""
    on_execute = AsyncMock(return_value="Task executed")
    on_notify = AsyncMock()

    service = HeartbeatService(
        workspace=tmp_path,
        provider=mock_provider,
        model="test-model",
        on_execute=on_execute,
        on_notify=on_notify,
        interval_s=9999,
        enabled=True,
    )
    return service, mock_provider, on_execute, on_notify


class TestDecideMethod:
    """Tests for the _decide method."""

    @pytest.mark.asyncio
    async def test_decide_returns_skip_when_no_tool_call(self, heartbeat_service):
        """Should return 'skip' when LLM makes no tool call."""
        service, mock_provider, _, _ = heartbeat_service

        # Mock response without tool calls
        mock_response = MagicMock()
        mock_response.has_tool_calls = False
        mock_provider.chat.return_value = mock_response

        action, tasks = await service._decide("some content")
        assert action == "skip"
        assert tasks == ""

    @pytest.mark.asyncio
    async def test_decide_returns_run_with_tasks(self, heartbeat_service):
        """Should return 'run' and tasks when LLM calls heartbeat tool with action=run."""
        service, mock_provider, _, _ = heartbeat_service

        # Mock response with tool call
        mock_response = MagicMock()
        mock_response.has_tool_calls = True
        mock_tool_call = MagicMock()
        mock_tool_call.arguments = {"action": "run", "tasks": "Check emails and respond"}
        mock_response.tool_calls = [mock_tool_call]
        mock_provider.chat.return_value = mock_response

        action, tasks = await service._decide("HEARTBEAT.md content")
        assert action == "run"
        assert tasks == "Check emails and respond"

    @pytest.mark.asyncio
    async def test_decide_returns_skip_with_action_skip(self, heartbeat_service):
        """Should return 'skip' when LLM calls heartbeat tool with action=skip."""
        service, mock_provider, _, _ = heartbeat_service

        # Mock response with tool call
        mock_response = MagicMock()
        mock_response.has_tool_calls = True
        mock_tool_call = MagicMock()
        mock_tool_call.arguments = {"action": "skip"}
        mock_response.tool_calls = [mock_tool_call]
        mock_provider.chat.return_value = mock_response

        action, tasks = await service._decide("HEARTBEAT.md content")
        assert action == "skip"
        assert tasks == ""

    @pytest.mark.asyncio
    async def test_decide_defaults_to_skip_on_missing_action(self, heartbeat_service):
        """Should default to 'skip' when action is missing in tool call."""
        service, mock_provider, _, _ = heartbeat_service

        # Mock response with tool call but missing action
        mock_response = MagicMock()
        mock_response.has_tool_calls = True
        mock_tool_call = MagicMock()
        mock_tool_call.arguments = {}
        mock_response.tool_calls = [mock_tool_call]
        mock_provider.chat.return_value = mock_response

        action, tasks = await service._decide("HEARTBEAT.md content")
        assert action == "skip"


class TestHeartbeatFile:
    """Tests for heartbeat file reading."""

    def test_heartbeat_file_path(self, tmp_path, mock_provider):
        """Should return correct heartbeat file path."""
        service = HeartbeatService(
            workspace=tmp_path,
            provider=mock_provider,
            model="test-model",
        )
        assert service.heartbeat_file == tmp_path / "HEARTBEAT.md"

    def test_read_heartbeat_file_exists(self, heartbeat_service):
        """Should read existing heartbeat file."""
        service, _, _, _ = heartbeat_service
        service.heartbeat_file.write_text("Test content")

        content = service._read_heartbeat_file()
        assert content == "Test content"

    def test_read_heartbeat_file_missing(self, heartbeat_service):
        """Should return None when heartbeat file doesn't exist."""
        service, _, _, _ = heartbeat_service

        content = service._read_heartbeat_file()
        assert content is None

    def test_read_heartbeat_file_error(self, heartbeat_service):
        """Should return None on read error."""
        service, _, _, _ = heartbeat_service
        # Create a directory instead of file to cause read error
        service.heartbeat_file.mkdir()

        content = service._read_heartbeat_file()
        assert content is None


class TestStartStop:
    """Tests for start and stop methods."""

    @pytest.mark.asyncio
    async def test_start_is_idempotent(self, heartbeat_service):
        """Starting twice should not create a new task."""
        service, _, _, _ = heartbeat_service

        await service.start()
        first_task = service._task
        await service.start()

        assert service._task is first_task

        service.stop()
        await asyncio.sleep(0)

    @pytest.mark.asyncio
    async def test_start_when_disabled(self, tmp_path, mock_provider):
        """Should not start when disabled."""
        service = HeartbeatService(
            workspace=tmp_path,
            provider=mock_provider,
            model="test-model",
            enabled=False,
        )

        await service.start()
        assert service._task is None

    @pytest.mark.asyncio
    async def test_stop_cancels_task(self, heartbeat_service):
        """Stop should cancel the running task."""
        service, _, _, _ = heartbeat_service

        await service.start()
        assert service._task is not None
        assert service._running is True

        service.stop()
        assert service._task is None
        assert service._running is False


class TestTick:
    """Tests for the _tick method."""

    @pytest.mark.asyncio
    async def test_tick_no_heartbeat_file(self, heartbeat_service):
        """Should return early when no heartbeat file exists."""
        service, mock_provider, _, _ = heartbeat_service

        await service._tick()

        # Provider should not be called
        mock_provider.chat.assert_not_called()

    @pytest.mark.asyncio
    async def test_tick_skip_action(self, heartbeat_service):
        """Should not execute when action is 'skip'."""
        service, mock_provider, on_execute, _ = heartbeat_service

        # Create heartbeat file
        service.heartbeat_file.write_text("Some content")

        # Mock LLM to return skip
        mock_response = MagicMock()
        mock_response.has_tool_calls = True
        mock_tool_call = MagicMock()
        mock_tool_call.arguments = {"action": "skip"}
        mock_response.tool_calls = [mock_tool_call]
        mock_provider.chat.return_value = mock_response

        await service._tick()

        on_execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_tick_run_action(self, heartbeat_service):
        """Should execute and notify when action is 'run'."""
        service, mock_provider, on_execute, on_notify = heartbeat_service

        # Create heartbeat file
        service.heartbeat_file.write_text("Active tasks here")

        # Mock LLM to return run
        mock_response = MagicMock()
        mock_response.has_tool_calls = True
        mock_tool_call = MagicMock()
        mock_tool_call.arguments = {"action": "run", "tasks": "Do something"}
        mock_response.tool_calls = [mock_tool_call]
        mock_provider.chat.return_value = mock_response

        await service._tick()

        on_execute.assert_called_once_with("Do something")
        on_notify.assert_called_once_with("Task executed")

    @pytest.mark.asyncio
    async def test_tick_run_action_no_notify_on_empty_response(self, heartbeat_service):
        """Should not notify when on_execute returns None or empty."""
        service, mock_provider, on_execute, on_notify = heartbeat_service
        on_execute.return_value = None

        # Create heartbeat file
        service.heartbeat_file.write_text("Active tasks here")

        # Mock LLM to return run
        mock_response = MagicMock()
        mock_response.has_tool_calls = True
        mock_tool_call = MagicMock()
        mock_tool_call.arguments = {"action": "run", "tasks": "Do something"}
        mock_response.tool_calls = [mock_tool_call]
        mock_provider.chat.return_value = mock_response

        await service._tick()

        on_execute.assert_called_once()
        on_notify.assert_not_called()


class TestTriggerNow:
    """Tests for the trigger_now method."""

    @pytest.mark.asyncio
    async def test_trigger_now_no_file(self, heartbeat_service):
        """Should return None when no heartbeat file exists."""
        service, _, _, _ = heartbeat_service

        result = await service.trigger_now()
        assert result is None

    @pytest.mark.asyncio
    async def test_trigger_now_skip_action(self, heartbeat_service):
        """Should return None when action is 'skip'."""
        service, mock_provider, _, _ = heartbeat_service

        service.heartbeat_file.write_text("Content")

        mock_response = MagicMock()
        mock_response.has_tool_calls = True
        mock_tool_call = MagicMock()
        mock_tool_call.arguments = {"action": "skip"}
        mock_response.tool_calls = [mock_tool_call]
        mock_provider.chat.return_value = mock_response

        result = await service.trigger_now()
        assert result is None

    @pytest.mark.asyncio
    async def test_trigger_now_run_action(self, heartbeat_service):
        """Should return execution result when action is 'run'."""
        service, mock_provider, on_execute, _ = heartbeat_service

        service.heartbeat_file.write_text("Content")

        mock_response = MagicMock()
        mock_response.has_tool_calls = True
        mock_tool_call = MagicMock()
        mock_tool_call.arguments = {"action": "run", "tasks": "Task"}
        mock_response.tool_calls = [mock_tool_call]
        mock_provider.chat.return_value = mock_response

        result = await service.trigger_now()
        assert result == "Task executed"
        on_execute.assert_called_once_with("Task")

    @pytest.mark.asyncio
    async def test_trigger_now_no_execute_callback(self, tmp_path, mock_provider):
        """Should return None when on_execute is not set."""
        service = HeartbeatService(
            workspace=tmp_path,
            provider=mock_provider,
            model="test-model",
            on_execute=None,  # No callback
        )

        service.heartbeat_file.write_text("Content")

        mock_response = MagicMock()
        mock_response.has_tool_calls = True
        mock_tool_call = MagicMock()
        mock_tool_call.arguments = {"action": "run", "tasks": "Task"}
        mock_response.tool_calls = [mock_tool_call]
        mock_provider.chat.return_value = mock_response

        result = await service.trigger_now()
        assert result is None
