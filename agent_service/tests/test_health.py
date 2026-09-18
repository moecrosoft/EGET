import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("LITELLM_MASTER_KEY", "sk-test-master-key")
    # Import after the env var is set, since app.config.settings is
    # constructed at module import time.
    from app.main import app

    return TestClient(app)


def test_health_returns_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
