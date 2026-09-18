"""Task-type -> tier routing, with a long-context bump and one-shot
escalation-on-failure. This is the only place task code should call into
the LLM layer through — see `route_and_call`.
"""

from enum import Enum

import openai

from app.llm import litellm_client
from app.llm.tiers import TIER_MODELS, Tier, next_tier

# Above this many tokens of expected context, bump one tier up before
# the first call (a bigger model handles long context more reliably).
LONG_CONTEXT_TOKEN_THRESHOLD = 6000


class TaskType(str, Enum):
    QUERY_REWRITE = "QUERY_REWRITE"
    TOOL_SELECTION = "TOOL_SELECTION"
    RERANK_FILTER = "RERANK_FILTER"
    MEMORY_SUMMARY = "MEMORY_SUMMARY"
    FINAL_SYNTHESIS = "FINAL_SYNTHESIS"
    NUDGE_GENERATION = "NUDGE_GENERATION"


TASK_TIER_MAP: dict[TaskType, Tier] = {
    TaskType.QUERY_REWRITE: Tier.NANO,
    TaskType.TOOL_SELECTION: Tier.NANO,
    TaskType.RERANK_FILTER: Tier.NANO,
    TaskType.MEMORY_SUMMARY: Tier.SMALL,
    TaskType.FINAL_SYNTHESIS: Tier.LARGE,
    TaskType.NUDGE_GENERATION: Tier.LARGE,
}


async def route_and_call(
    task_type: TaskType,
    messages: list[dict],
    context_size_hint: int = 0,
    **kwargs,
) -> str:
    """Resolve `task_type` to a tier, call LiteLLM at that tier, and on a
    failed call retry once at the next tier up.

    `context_size_hint` (an approximate token count of the input) bumps
    the tier up by one rung before the first attempt if it exceeds
    `LONG_CONTEXT_TOKEN_THRESHOLD`. If the resolved call then raises an
    `openai.APIError` (which also covers timeouts), retry exactly once at
    the next tier up; if already at `LARGE`, there is no further tier to
    escalate to, so the error is re-raised instead of retried.
    """
    tier = TASK_TIER_MAP[task_type]
    if context_size_hint > LONG_CONTEXT_TOKEN_THRESHOLD:
        tier = next_tier(tier)

    model = TIER_MODELS[tier]
    try:
        return await litellm_client.chat_completion(model, messages, **kwargs)
    except openai.APIError:
        escalated_tier = next_tier(tier)
        if escalated_tier == tier:
            raise
        escalated_model = TIER_MODELS[escalated_tier]
        return await litellm_client.chat_completion(escalated_model, messages, **kwargs)
