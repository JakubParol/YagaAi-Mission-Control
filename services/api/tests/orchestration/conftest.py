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
          retry_attempt INTEGER NOT NULL DEFAULT 1,
          max_attempts INTEGER NOT NULL DEFAULT 5,
          available_at TEXT NOT NULL,
          published_at TEXT,
          last_error TEXT,
          dead_lettered_at TEXT,
          dead_letter_payload_json TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE orchestration_consumer_offsets (
          stream_key TEXT NOT NULL,
          consumer_group TEXT NOT NULL,
          consumer_name TEXT NOT NULL,
          last_message_id TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (stream_key, consumer_group, consumer_name)
        );

        CREATE TABLE orchestration_processed_messages (
          stream_key TEXT NOT NULL,
          consumer_group TEXT NOT NULL,
          message_id TEXT NOT NULL,
          correlation_id TEXT NOT NULL,
          processed_at TEXT NOT NULL,
          PRIMARY KEY (stream_key, consumer_group, message_id)
        );

        CREATE TABLE orchestration_runs (
          run_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          correlation_id TEXT NOT NULL,
          current_step_id TEXT,
          last_event_type TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          run_type TEXT NOT NULL DEFAULT 'DEFAULT',
          lease_owner TEXT,
          lease_token TEXT,
          last_heartbeat_at TEXT,
          watchdog_timeout_at TEXT,
          watchdog_attempt INTEGER NOT NULL DEFAULT 0,
          watchdog_state TEXT NOT NULL DEFAULT 'NONE',
          terminal_at TEXT
        );

        CREATE TABLE orchestration_run_steps (
          step_id TEXT NOT NULL,
          run_id TEXT NOT NULL REFERENCES orchestration_runs(run_id) ON DELETE CASCADE,
          status TEXT NOT NULL,
          last_event_type TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          terminal_at TEXT,
          PRIMARY KEY (run_id, step_id)
        );

        CREATE TABLE orchestration_run_timeline (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          step_id TEXT,
          message_id TEXT,
          event_type TEXT NOT NULL,
          decision TEXT NOT NULL,
          reason_code TEXT,
          reason_message TEXT,
          correlation_id TEXT NOT NULL,
          causation_id TEXT,
          payload_json TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
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
