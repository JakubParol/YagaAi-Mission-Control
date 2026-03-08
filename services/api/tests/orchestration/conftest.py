import os
import sqlite3

import pytest

os.environ["MC_API_DB_PATH"] = ""


@pytest.fixture()
def db_path(tmp_path, monkeypatch):
    path = str(tmp_path / "orchestration.db")
    conn = sqlite3.connect(path)
    conn.executescript("""
        PRAGMA foreign_keys = ON;

        CREATE TABLE orchestration_commands (
          id TEXT PRIMARY KEY,
          command_type TEXT NOT NULL,
          schema_version TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          producer TEXT NOT NULL,
          correlation_id TEXT NOT NULL,
          causation_id TEXT,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE orchestration_outbox (
          id TEXT PRIMARY KEY,
          command_id TEXT NOT NULL REFERENCES orchestration_commands(id) ON DELETE CASCADE,
          event_type TEXT NOT NULL,
          schema_version TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          producer TEXT NOT NULL,
          correlation_id TEXT NOT NULL,
          causation_id TEXT,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL,
          available_at TEXT NOT NULL,
          published_at TEXT,
          last_error TEXT,
          created_at TEXT NOT NULL
        );
        """)
    conn.close()

    from app.config import settings

    monkeypatch.setattr(settings, "db_path", path)
    return path


@pytest.fixture()
def client(request):
    _ = request.getfixturevalue("db_path")
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)
