import os
from unittest.mock import AsyncMock, patch

os.environ.setdefault("LITELLM_MASTER_KEY", "sk-test-master-key")

import httpx
import openai
import pytest

from app.llm.router import (
    LONG_CONTEXT_TOKEN_THRESHOLD,
    TASK_TIER_MAP,
    TaskType,
    route_and_call,
)
from app.llm.tiers import Tier

MESSAGES = [{"role": "user", "content": "hi"}]


def _api_error(message: str = "boom") -> openai.APIError:
    request = httpx.Request("POST", "http://test/chat/completions")
    return openai.APIError(message, request, body=None)


@pytest.mark.parametrize(
    "task_type,expected_tier",
    [
        (TaskType.QUERY_REWRITE, Tier.NANO),
        (TaskType.TOOL_SELECTION, Tier.NANO),
        (TaskType.RERANK_FILTER, Tier.NANO),
        (TaskType.MEMORY_SUMMARY, Tier.SMALL),
        (TaskType.FINAL_SYNTHESIS, Tier.LARGE),
        (TaskType.NUDGE_GENERATION, Tier.LARGE),
    ],
)
def test_task_tier_map_matches_spec(task_type, expected_tier):
    assert TASK_TIER_MAP[task_type] == expected_tier


@pytest.mark.asyncio
async def test_route_and_call_uses_mapped_tier_model():
    with patch(
        "app.llm.router.litellm_client.chat_completion",
        new=AsyncMock(return_value="reply"),
    ) as mock_call:
        result = await route_and_call(TaskType.QUERY_REWRITE, MESSAGES)

    assert result == "reply"
    mock_call.assert_awaited_once_with("tier-nano", MESSAGES)


@pytest.mark.asyncio
async def test_route_and_call_uses_large_tier_for_final_synthesis():
    with patch(
        "app.llm.router.litellm_client.chat_completion",
        new=AsyncMock(return_value="reply"),
    ) as mock_call:
        await route_and_call(TaskType.FINAL_SYNTHESIS, MESSAGES)

    mock_call.assert_awaited_once_with("tier-large", MESSAGES)


@pytest.mark.asyncio
async def test_route_and_call_bumps_tier_on_long_context():
    with patch(
        "app.llm.router.litellm_client.chat_completion",
        new=AsyncMock(return_value="reply"),
    ) as mock_call:
        await route_and_call(
            TaskType.QUERY_REWRITE,
            MESSAGES,
            context_size_hint=LONG_CONTEXT_TOKEN_THRESHOLD + 1,
        )

    # QUERY_REWRITE maps to NANO; a long-context hint should bump it to SMALL.
    mock_call.assert_awaited_once_with("tier-small", MESSAGES)


@pytest.mark.asyncio
async def test_route_and_call_does_not_bump_at_or_below_threshold():
    with patch(
        "app.llm.router.litellm_client.chat_completion",
        new=AsyncMock(return_value="reply"),
    ) as mock_call:
        await route_and_call(
            TaskType.QUERY_REWRITE,
            MESSAGES,
            context_size_hint=LONG_CONTEXT_TOKEN_THRESHOLD,
        )

    mock_call.assert_awaited_once_with("tier-nano", MESSAGES)


@pytest.mark.asyncio
async def test_route_and_call_long_context_bump_caps_at_large():
    with patch(
        "app.llm.router.litellm_client.chat_completion",
        new=AsyncMock(return_value="reply"),
    ) as mock_call:
        await route_and_call(
            TaskType.FINAL_SYNTHESIS,
            MESSAGES,
            context_size_hint=LONG_CONTEXT_TOKEN_THRESHOLD + 1,
        )

    # FINAL_SYNTHESIS is already LARGE; nothing further to bump to.
    mock_call.assert_awaited_once_with("tier-large", MESSAGES)


@pytest.mark.asyncio
async def test_route_and_call_escalates_to_next_tier_on_api_error():
    mock_call = AsyncMock(side_effect=[_api_error(), "recovered"])
    with patch("app.llm.router.litellm_client.chat_completion", new=mock_call):
        result = await route_and_call(TaskType.QUERY_REWRITE, MESSAGES)

    assert result == "recovered"
    assert mock_call.await_count == 2
    mock_call.assert_any_await("tier-nano", MESSAGES)
    mock_call.assert_any_await("tier-small", MESSAGES)


@pytest.mark.asyncio
async def test_route_and_call_escalation_uses_next_tier_after_bump():
    # MEMORY_SUMMARY -> SMALL, bumped to LARGE by long context; on failure
    # there is no further tier, so the error should propagate rather than
    # loop back to a lower tier.
    mock_call = AsyncMock(side_effect=_api_error())
    with patch("app.llm.router.litellm_client.chat_completion", new=mock_call):
        with pytest.raises(openai.APIError):
            await route_and_call(
                TaskType.MEMORY_SUMMARY,
                MESSAGES,
                context_size_hint=LONG_CONTEXT_TOKEN_THRESHOLD + 1,
            )

    mock_call.assert_awaited_once_with("tier-large", MESSAGES)


@pytest.mark.asyncio
async def test_route_and_call_at_large_tier_raises_without_retry_on_failure():
    mock_call = AsyncMock(side_effect=_api_error())
    with patch("app.llm.router.litellm_client.chat_completion", new=mock_call):
        with pytest.raises(openai.APIError):
            await route_and_call(TaskType.FINAL_SYNTHESIS, MESSAGES)

    mock_call.assert_awaited_once_with("tier-large", MESSAGES)


@pytest.mark.asyncio
async def test_route_and_call_forwards_extra_kwargs():
    with patch(
        "app.llm.router.litellm_client.chat_completion",
        new=AsyncMock(return_value="reply"),
    ) as mock_call:
        await route_and_call(
            TaskType.NUDGE_GENERATION, MESSAGES, temperature=0.5
        )

    mock_call.assert_awaited_once_with("tier-large", MESSAGES, temperature=0.5)
