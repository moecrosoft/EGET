import sys

import pytest
from pydantic import ValidationError


def test_settings_requires_litellm_master_key(monkeypatch):
    """LITELLM_MASTER_KEY must be set — LiteLLM proxy auth relies on it, and
    an empty/missing key would let the app boot with an unauthenticated
    proxy sitting in front of real provider API keys.

    `app.config` builds its module-level `settings` singleton at import
    time, so importing it without the env var set is itself expected to
    raise.
    """
    monkeypatch.delenv("LITELLM_MASTER_KEY", raising=False)
    sys.modules.pop("app.config", None)

    with pytest.raises(ValidationError):
        import app.config  # noqa: F401


def test_settings_accepts_litellm_master_key_from_env(monkeypatch):
    monkeypatch.setenv("LITELLM_MASTER_KEY", "sk-test-master-key")
    sys.modules.pop("app.config", None)

    import app.config

    assert app.config.settings.litellm_master_key == "sk-test-master-key"
