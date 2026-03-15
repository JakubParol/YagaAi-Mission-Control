import pytest


@pytest.fixture(autouse=True)
def _setup_test_db(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "langfuse_host", "http://localhost:9999")
    monkeypatch.setattr(settings, "langfuse_public_key", "pk-test")
    monkeypatch.setattr(settings, "langfuse_secret_key", "sk-test")


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)
