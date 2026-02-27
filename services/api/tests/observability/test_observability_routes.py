import os
import sqlite3

import pytest

# Set env vars BEFORE importing app
os.environ["MC_API_DB_PATH"] = ""
os.environ["MC_API_WORKFLOW_SYSTEM_PATH"] = "/tmp/nonexistent_workflow_test"


@pytest.fixture(autouse=True)
def _setup_test_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test.db")
    conn = sqlite3.connect(db_path)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS imports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            mode TEXT NOT NULL,
            from_timestamp TEXT,
            to_timestamp TEXT NOT NULL,
            status TEXT NOT NULL,
            error_message TEXT
        );
        CREATE TABLE IF NOT EXISTS langfuse_daily_metrics (
            date TEXT NOT NULL,
            model TEXT NOT NULL,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            request_count INTEGER NOT NULL DEFAULT 0,
            total_cost REAL NOT NULL DEFAULT 0,
            PRIMARY KEY (date, model)
        );
        CREATE TABLE IF NOT EXISTS langfuse_requests (
            id TEXT PRIMARY KEY,
            trace_id TEXT,
            name TEXT,
            model TEXT,
            started_at TEXT,
            finished_at TEXT,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            cost REAL,
            latency_ms INTEGER
        );
        """)
    conn.close()

    # Patch the settings object directly
    from app.config import settings

    monkeypatch.setattr(settings, "db_path", db_path)
    monkeypatch.setattr(settings, "workflow_system_path", str(tmp_path / "workflow"))
    monkeypatch.setattr(settings, "langfuse_host", "http://localhost:9999")
    monkeypatch.setattr(settings, "langfuse_public_key", "pk-test")
    monkeypatch.setattr(settings, "langfuse_secret_key", "sk-test")


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


def test_healthz(client) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200


def test_get_costs_empty_db(client) -> None:
    response = client.get("/v1/observability/costs?days=7")
    assert response.status_code == 200
    data = response.json()
    assert "daily" in data
    assert isinstance(data["daily"], list)


def test_get_requests_empty_db(client) -> None:
    response = client.get("/v1/observability/requests")
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "meta" in data
    assert data["meta"]["page"] == 1


def test_get_request_models_empty_db(client) -> None:
    response = client.get("/v1/observability/requests/models")
    assert response.status_code == 200
    data = response.json()
    assert "models" in data
    assert isinstance(data["models"], list)


def test_get_import_status_empty_db(client) -> None:
    response = client.get("/v1/observability/imports/status")
    assert response.status_code == 200
    data = response.json()
    assert "lastImport" in data
    assert "counts" in data


def test_get_agents_no_filesystem(client) -> None:
    response = client.get("/v1/observability/agents")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 4
    assert all(a["status"] == "idle" for a in data)


def test_list_stories_no_filesystem(client) -> None:
    response = client.get("/v1/observability/workflow/stories")
    assert response.status_code == 200
    assert response.json() == []


def test_get_board_no_filesystem(client) -> None:
    response = client.get("/v1/observability/workflow/board")
    assert response.status_code == 200
    data = response.json()
    assert data == {"stories": [], "tasks": []}


def test_get_story_not_found(client) -> None:
    response = client.get("/v1/observability/workflow/stories/nonexistent")
    assert response.status_code == 404


def test_get_task_not_found(client) -> None:
    response = client.get("/v1/observability/workflow/tasks/story1/task1")
    assert response.status_code == 404
