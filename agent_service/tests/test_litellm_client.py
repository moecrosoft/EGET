import os
from unittest.mock import AsyncMock, patch

os.environ.setdefault("LITELLM_MASTER_KEY", "sk-test-master-key")

import pytest

from app.llm import litellm_client


def _fake_response(text: str):
    message = AsyncMock()
    message.content = text
    choice = AsyncMock()
    choice.message = message
    response = AsyncMock()
    response.choices = [choice]
    return response


@pytest.mark.asyncio
async def test_chat_completion_returns_reply_text():
    fake_response = _fake_response("hello there")

    with patch.object(
        litellm_client.client.chat.completions,
        "create",
        new=AsyncMock(return_value=fake_response),
    ) as mock_create:
        result = await litellm_client.chat_completion(
            "tier-nano", [{"role": "user", "content": "hi"}]
        )

    assert result == "hello there"
    mock_create.assert_awaited_once_with(
        model="tier-nano",
        messages=[{"role": "user", "content": "hi"}],
    )


@pytest.mark.asyncio
async def test_chat_completion_passes_through_kwargs():
    fake_response = _fake_response("ok")

    with patch.object(
        litellm_client.client.chat.completions,
        "create",
        new=AsyncMock(return_value=fake_response),
    ) as mock_create:
        await litellm_client.chat_completion(
            "tier-large",
            [{"role": "user", "content": "hi"}],
            temperature=0.2,
            max_tokens=100,
        )

    mock_create.assert_awaited_once_with(
        model="tier-large",
        messages=[{"role": "user", "content": "hi"}],
        temperature=0.2,
        max_tokens=100,
    )
