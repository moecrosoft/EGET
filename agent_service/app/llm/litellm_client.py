"""Async wrapper around the LiteLLM proxy's OpenAI-compatible endpoint.

LiteLLM (see `litellm_config.yaml`) exposes the same `/chat/completions`
surface as OpenAI, so we talk to it with the `openai` SDK's `AsyncOpenAI`
client, just pointed at the proxy's base URL with the proxy's master key
as the bearer token instead of a real provider key.
"""

from openai import AsyncOpenAI

from app.config import settings

client = AsyncOpenAI(
    base_url=settings.litellm_base_url,
    api_key=settings.litellm_master_key,
)


async def chat_completion(model: str, messages: list[dict], **kwargs) -> str:
    """Call LiteLLM's /chat/completions with `model` and return the reply text.

    `model` is a LiteLLM `model_name` from `litellm_config.yaml` (e.g.
    `tier-nano`), not a raw provider model id. Additional OpenAI chat
    completion kwargs (e.g. `temperature`, `max_tokens`) pass through.
    """
    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        **kwargs,
    )
    return response.choices[0].message.content
