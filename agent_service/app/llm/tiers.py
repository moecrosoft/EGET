"""Model tiers: cost/capability rungs the router escalates across.

Each tier maps to a `model_name` declared in `litellm_config.yaml`. The
app never names a raw provider model directly — it always goes through
one of these tier names, and LiteLLM resolves the actual provider/model
(plus, for `tier-large`, its own fallback to `tier-large-fallback`).
"""

from enum import Enum


class Tier(str, Enum):
    NANO = "NANO"
    SMALL = "SMALL"
    LARGE = "LARGE"


TIER_MODELS: dict[Tier, str] = {
    Tier.NANO: "tier-nano",
    Tier.SMALL: "tier-small",
    Tier.LARGE: "tier-large",
}

# Ordered cheapest -> most capable, used to compute the "next tier up".
_TIER_ORDER: list[Tier] = [Tier.NANO, Tier.SMALL, Tier.LARGE]


def next_tier(tier: Tier) -> Tier:
    """Return the tier one rung above `tier`, or `tier` unchanged if it's
    already the top (`LARGE`) — there is nowhere further to escalate."""
    index = _TIER_ORDER.index(tier)
    if index == len(_TIER_ORDER) - 1:
        return tier
    return _TIER_ORDER[index + 1]
