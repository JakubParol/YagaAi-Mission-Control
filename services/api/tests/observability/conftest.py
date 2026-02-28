"""
Shared fixtures for observability module integration tests.

Provides an in-memory SQLite database with Langfuse-related tables
(imports, langfuse_daily_metrics, langfuse_requests) and a FastAPI TestClient.

Fixtures:
- _setup_test_db (autouse) — creates temp SQLite DB with observability schema,
  patches settings (db_path, langfuse_host, langfuse keys)
- client — FastAPI TestClient instance
"""

import os
import sqlite3

import pytest

# Set env vars BEFORE importing app
os.environ["MC_API_DB_PATH"] = ""


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
    monkeypatch.setattr(settings, "langfuse_host", "http://localhost:9999")
    monkeypatch.setattr(settings, "langfuse_public_key", "pk-test")
    monkeypatch.setattr(settings, "langfuse_secret_key", "sk-test")


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)
