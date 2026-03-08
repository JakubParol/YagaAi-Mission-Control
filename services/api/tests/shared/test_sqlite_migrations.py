import sqlite3
from pathlib import Path

import pytest

from app.shared.db.migrations import migrate_sqlite_or_raise


def _create_legacy_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.executescript("""
        PRAGMA foreign_keys = ON;

        CREATE TABLE agents (
          id TEXT PRIMARY KEY,
          openclaw_key TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          role TEXT,
          worker_type TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          source TEXT NOT NULL DEFAULT 'manual',
          metadata_json TEXT,
          last_synced_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE stories (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          epic_id TEXT,
          key TEXT,
          title TEXT NOT NULL,
          intent TEXT,
          description TEXT,
          story_type TEXT NOT NULL,
          status TEXT NOT NULL,
          is_blocked INTEGER NOT NULL DEFAULT 0,
          blocked_reason TEXT,
          priority INTEGER,
          metadata_json TEXT,
          created_by TEXT,
          updated_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT
        );

        CREATE TABLE backlogs (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          name TEXT NOT NULL,
          kind TEXT NOT NULL,
          status TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          goal TEXT,
          start_date TEXT,
          end_date TEXT,
          metadata_json TEXT,
          created_by TEXT,
          updated_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO backlogs (id, project_id, name, kind, status, created_at, updated_at)
        VALUES
          ('b1', 'p1', 'Sprint A', 'SPRINT', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
          ('b2', 'p1', 'Sprint B', 'SPRINT', 'ACTIVE', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z');
        """)
    conn.commit()
    conn.close()


def test_migrations_are_applied_and_idempotent(tmp_path: Path) -> None:
    db_path = tmp_path / "legacy.db"
    _create_legacy_db(db_path)

    migrate_sqlite_or_raise(str(db_path))
    migrate_sqlite_or_raise(str(db_path))

    conn = sqlite3.connect(db_path)

    agent_columns = {row[1] for row in conn.execute("PRAGMA table_info(agents)").fetchall()}
    assert {"avatar", "last_name", "initials"}.issubset(agent_columns)

    story_columns = {row[1] for row in conn.execute("PRAGMA table_info(stories)").fetchall()}
    assert "current_assignee_agent_id" in story_columns

    backlog_columns = {row[1] for row in conn.execute("PRAGMA table_info(backlogs)").fetchall()}
    assert "display_order" in backlog_columns

    migration_versions = [
        row[0]
        for row in conn.execute("SELECT version FROM schema_migrations ORDER BY version").fetchall()
    ]
    assert migration_versions == [
        "20260307_001",
        "20260307_002",
        "20260307_003",
        "20260307_004",
        "20260308_001",
        "20260308_002",
        "20260308_003",
        "20260308_004",
        "20260308_005",
    ]

    command_columns = {
        row[1] for row in conn.execute("PRAGMA table_info(orchestration_commands)").fetchall()
    }
    assert {"command_type", "schema_version", "payload_json", "status"}.issubset(command_columns)

    outbox_columns = {
        row[1] for row in conn.execute("PRAGMA table_info(orchestration_outbox)").fetchall()
    }
    assert {
        "command_id",
        "event_type",
        "available_at",
        "payload_json",
        "status",
        "retry_attempt",
        "max_attempts",
        "dead_lettered_at",
        "dead_letter_payload_json",
    }.issubset(outbox_columns)

    consumer_offset_columns = {
        row[1]
        for row in conn.execute("PRAGMA table_info(orchestration_consumer_offsets)").fetchall()
    }
    assert {"stream_key", "consumer_group", "consumer_name", "last_message_id"}.issubset(
        consumer_offset_columns
    )

    processed_columns = {
        row[1]
        for row in conn.execute("PRAGMA table_info(orchestration_processed_messages)").fetchall()
    }
    assert {"stream_key", "consumer_group", "message_id", "correlation_id"}.issubset(
        processed_columns
    )

    run_columns = {
        row[1] for row in conn.execute("PRAGMA table_info(orchestration_runs)").fetchall()
    }
    assert {
        "run_id",
        "status",
        "correlation_id",
        "last_event_type",
        "run_type",
        "lease_owner",
        "lease_token",
        "last_heartbeat_at",
        "watchdog_timeout_at",
        "watchdog_attempt",
        "watchdog_state",
    }.issubset(run_columns)

    step_columns = {
        row[1] for row in conn.execute("PRAGMA table_info(orchestration_run_steps)").fetchall()
    }
    assert {"step_id", "run_id", "status", "last_event_type"}.issubset(step_columns)

    timeline_columns = {
        row[1] for row in conn.execute("PRAGMA table_info(orchestration_run_timeline)").fetchall()
    }
    assert {"run_id", "event_type", "decision", "correlation_id", "payload_json"}.issubset(
        timeline_columns
    )

    active_sprints = conn.execute(
        "SELECT COUNT(*) FROM backlogs WHERE project_id='p1' AND kind='SPRINT' AND status='ACTIVE'"
    ).fetchone()[0]
    assert active_sprints == 1

    conn.close()


def test_migration_fails_for_corrupt_db(tmp_path: Path) -> None:
    db_path = tmp_path / "corrupt.db"
    db_path.write_bytes(b"not-a-sqlite-db")

    with pytest.raises(RuntimeError, match="not readable"):
        migrate_sqlite_or_raise(str(db_path))


def test_migration_fails_when_parent_directory_missing(tmp_path: Path) -> None:
    db_path = tmp_path / "missing" / "nested" / "mission-control.db"
    with pytest.raises(RuntimeError, match="directory does not exist"):
        migrate_sqlite_or_raise(str(db_path))
