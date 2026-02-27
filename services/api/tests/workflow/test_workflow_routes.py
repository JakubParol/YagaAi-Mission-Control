import os

import pytest

# Set env vars BEFORE importing app
os.environ["MC_API_DB_PATH"] = ""
os.environ["MC_API_WORKFLOW_SYSTEM_PATH"] = "/tmp/nonexistent_workflow_test"


@pytest.fixture(autouse=True)
def _setup_test_env(tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(settings, "workflow_system_path", str(tmp_path / "workflow"))
    monkeypatch.setattr(settings, "langfuse_host", "http://localhost:9999")
    monkeypatch.setattr(settings, "langfuse_public_key", "pk-test")
    monkeypatch.setattr(settings, "langfuse_secret_key", "sk-test")


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


def test_get_agents_no_filesystem(client) -> None:
    response = client.get("/v1/workflow/agents")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 4
    assert all(a["status"] == "idle" for a in data)


def test_list_stories_no_filesystem(client) -> None:
    response = client.get("/v1/workflow/stories")
    assert response.status_code == 200
    assert response.json() == []


def test_get_board_no_filesystem(client) -> None:
    response = client.get("/v1/workflow/board")
    assert response.status_code == 200
    data = response.json()
    assert data == {"stories": [], "tasks": []}


def test_get_story_not_found(client) -> None:
    response = client.get("/v1/workflow/stories/nonexistent")
    assert response.status_code == 404


def test_get_task_not_found(client) -> None:
    response = client.get("/v1/workflow/tasks/story1/task1")
    assert response.status_code == 404
