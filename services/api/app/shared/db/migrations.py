from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


@dataclass(frozen=True)
class Migration:
    version: str
    description: str


def _column_exists(db: sqlite3.Connection, table: str, column: str) -> bool:
    cursor = db.execute(f"PRAGMA table_info({table})")
    rows = cursor.fetchall()
    return any(str(row[1]) == column for row in rows)


def _table_exists(db: sqlite3.Connection, table: str) -> bool:
    cursor = db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1", (table,)
    )
    return cursor.fetchone() is not None


def _create_migration_ledger(db: sqlite3.Connection) -> None:
    db.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version TEXT PRIMARY KEY,
          description TEXT NOT NULL,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """)


def _migration_20260307_001(db: sqlite3.Connection) -> None:
    if _table_exists(db, "agents") and not _column_exists(db, "agents", "avatar"):
        db.execute("ALTER TABLE agents ADD COLUMN avatar TEXT")
    if _table_exists(db, "agents") and not _column_exists(db, "agents", "last_name"):
        db.execute("ALTER TABLE agents ADD COLUMN last_name TEXT")
    if _table_exists(db, "agents") and not _column_exists(db, "agents", "initials"):
        db.execute("ALTER TABLE agents ADD COLUMN initials TEXT")


def _migration_20260307_002(db: sqlite3.Connection) -> None:
    if _table_exists(db, "stories") and not _column_exists(
        db, "stories", "current_assignee_agent_id"
    ):
        db.execute("ALTER TABLE stories ADD COLUMN current_assignee_agent_id TEXT")


def _migration_20260307_003(db: sqlite3.Connection) -> None:
    if not _table_exists(db, "backlogs"):
        return

    if not _column_exists(db, "backlogs", "display_order"):
        db.execute("ALTER TABLE backlogs ADD COLUMN display_order INTEGER NOT NULL DEFAULT 1000")
        db.execute("""
            WITH ordered AS (
              SELECT
                id,
                ROW_NUMBER() OVER (
                  PARTITION BY COALESCE(project_id, '__GLOBAL__')
                  ORDER BY created_at ASC, id ASC
                ) * 100 AS generated_order
              FROM backlogs
            )
            UPDATE backlogs
            SET display_order = (
              SELECT generated_order FROM ordered WHERE ordered.id = backlogs.id
            )
            """)

    db.execute("""
        WITH ranked AS (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY project_id
              ORDER BY display_order ASC, created_at ASC, id ASC
            ) AS rn
          FROM backlogs
          WHERE project_id IS NOT NULL
            AND kind = 'SPRINT'
            AND UPPER(status) = 'ACTIVE'
        )
        UPDATE backlogs
        SET status = 'OPEN'
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
        """)

    db.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_backlogs_one_default_per_project
          ON backlogs(project_id)
          WHERE project_id IS NOT NULL AND is_default = 1
        """)
    db.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_backlogs_one_active_sprint_per_project
          ON backlogs(project_id)
          WHERE project_id IS NOT NULL AND kind = 'SPRINT' AND status = 'ACTIVE'
        """)
    db.execute("""
        CREATE INDEX IF NOT EXISTS idx_backlogs_project_display_order
          ON backlogs(project_id, display_order)
        """)


def _migration_20260307_004(db: sqlite3.Connection) -> None:
    db.execute("""
        CREATE TABLE IF NOT EXISTS activity_log (
          id TEXT PRIMARY KEY,
          event_name TEXT NOT NULL,
          actor_id TEXT,
          actor_type TEXT,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          scope_json TEXT,
          metadata_json TEXT,
          occurred_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
        """)
    db.execute("""
        CREATE INDEX IF NOT EXISTS idx_activity_log_entity
          ON activity_log(entity_type, entity_id, occurred_at)
        """)


def _migration_20260308_001(db: sqlite3.Connection) -> None:
    db.execute("""
        CREATE TABLE IF NOT EXISTS orchestration_commands (
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
        )
        """)
    db.execute("""
        CREATE INDEX IF NOT EXISTS idx_orchestration_commands_created_at
          ON orchestration_commands(created_at)
        """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS orchestration_outbox (
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
        )
        """)
    db.execute("""
        CREATE INDEX IF NOT EXISTS idx_orchestration_outbox_status_available_at
          ON orchestration_outbox(status, available_at)
        """)
    db.execute("""
        CREATE INDEX IF NOT EXISTS idx_orchestration_outbox_command_id
          ON orchestration_outbox(command_id)
        """)


def _migration_20260308_002(db: sqlite3.Connection) -> None:
    if not _table_exists(db, "orchestration_outbox"):
        return
    if not _column_exists(db, "orchestration_outbox", "retry_attempt"):
        db.execute(
            "ALTER TABLE orchestration_outbox ADD COLUMN retry_attempt INTEGER NOT NULL DEFAULT 1"
        )
    if not _column_exists(db, "orchestration_outbox", "max_attempts"):
        db.execute(
            "ALTER TABLE orchestration_outbox ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 5"
        )
    if not _column_exists(db, "orchestration_outbox", "dead_lettered_at"):
        db.execute("ALTER TABLE orchestration_outbox ADD COLUMN dead_lettered_at TEXT")
    if not _column_exists(db, "orchestration_outbox", "dead_letter_payload_json"):
        db.execute("ALTER TABLE orchestration_outbox ADD COLUMN dead_letter_payload_json TEXT")


def _migration_20260308_003(db: sqlite3.Connection) -> None:
    db.execute("""
        CREATE TABLE IF NOT EXISTS orchestration_consumer_offsets (
          stream_key TEXT NOT NULL,
          consumer_group TEXT NOT NULL,
          consumer_name TEXT NOT NULL,
          last_message_id TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (stream_key, consumer_group, consumer_name)
        )
        """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS orchestration_processed_messages (
          stream_key TEXT NOT NULL,
          consumer_group TEXT NOT NULL,
          message_id TEXT NOT NULL,
          correlation_id TEXT NOT NULL,
          processed_at TEXT NOT NULL,
          PRIMARY KEY (stream_key, consumer_group, message_id)
        )
        """)
    db.execute("""
        CREATE INDEX IF NOT EXISTS idx_orchestration_processed_messages_correlation
          ON orchestration_processed_messages(correlation_id)
        """)


def _migration_20260308_004(db: sqlite3.Connection) -> None:
    db.execute("""
        CREATE TABLE IF NOT EXISTS orchestration_runs (
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
        )
        """)
    db.execute("""
        CREATE INDEX IF NOT EXISTS idx_orchestration_runs_status_updated_at
          ON orchestration_runs(status, updated_at)
        """)

    db.execute("""
        CREATE TABLE IF NOT EXISTS orchestration_run_steps (
          step_id TEXT NOT NULL,
          run_id TEXT NOT NULL REFERENCES orchestration_runs(run_id) ON DELETE CASCADE,
          status TEXT NOT NULL,
          last_event_type TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          terminal_at TEXT,
          PRIMARY KEY (run_id, step_id)
        )
        """)
    db.execute("""
        CREATE INDEX IF NOT EXISTS idx_orchestration_run_steps_run_status
          ON orchestration_run_steps(run_id, status, updated_at)
        """)

    db.execute("""
        CREATE TABLE IF NOT EXISTS orchestration_run_timeline (
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
        )
        """)
    db.execute("""
        CREATE INDEX IF NOT EXISTS idx_orchestration_run_timeline_run_created
          ON orchestration_run_timeline(run_id, created_at)
        """)
    db.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_orchestration_run_timeline_message
          ON orchestration_run_timeline(message_id)
          WHERE message_id IS NOT NULL
        """)


def _migration_20260308_005(db: sqlite3.Connection) -> None:
    if not _table_exists(db, "orchestration_runs"):
        return
    if not _column_exists(db, "orchestration_runs", "run_type"):
        db.execute(
            "ALTER TABLE orchestration_runs ADD COLUMN run_type TEXT NOT NULL DEFAULT 'DEFAULT'"
        )
    if not _column_exists(db, "orchestration_runs", "lease_owner"):
        db.execute("ALTER TABLE orchestration_runs ADD COLUMN lease_owner TEXT")
    if not _column_exists(db, "orchestration_runs", "lease_token"):
        db.execute("ALTER TABLE orchestration_runs ADD COLUMN lease_token TEXT")
    if not _column_exists(db, "orchestration_runs", "last_heartbeat_at"):
        db.execute("ALTER TABLE orchestration_runs ADD COLUMN last_heartbeat_at TEXT")
    if not _column_exists(db, "orchestration_runs", "watchdog_timeout_at"):
        db.execute("ALTER TABLE orchestration_runs ADD COLUMN watchdog_timeout_at TEXT")
    if not _column_exists(db, "orchestration_runs", "watchdog_attempt"):
        db.execute(
            "ALTER TABLE orchestration_runs ADD COLUMN watchdog_attempt INTEGER NOT NULL DEFAULT 0"
        )
    if not _column_exists(db, "orchestration_runs", "watchdog_state"):
        db.execute(
            "ALTER TABLE orchestration_runs ADD COLUMN watchdog_state TEXT NOT NULL DEFAULT 'NONE'"
        )
    db.execute("""
        CREATE INDEX IF NOT EXISTS idx_orchestration_runs_lease_token
          ON orchestration_runs(lease_token)
        """)


_MIGRATIONS: list[tuple[Migration, Callable[[sqlite3.Connection], None]]] = [
    (Migration("20260307_001", "add missing agents profile columns"), _migration_20260307_001),
    (Migration("20260307_002", "add stories.current_assignee_agent_id"), _migration_20260307_002),
    (
        Migration("20260307_003", "backlog display_order + lifecycle indexes"),
        _migration_20260307_003,
    ),
    (Migration("20260307_004", "create activity log table + index"), _migration_20260307_004),
    (
        Migration("20260308_001", "create orchestration command + outbox tables"),
        _migration_20260308_001,
    ),
    (
        Migration("20260308_002", "add orchestration outbox retry/dead-letter columns"),
        _migration_20260308_002,
    ),
    (
        Migration("20260308_003", "create orchestration consumer recovery tables"),
        _migration_20260308_003,
    ),
    (
        Migration("20260308_004", "create orchestration run state + timeline ledger tables"),
        _migration_20260308_004,
    ),
    (
        Migration("20260308_005", "add watchdog lease/heartbeat/timeout columns to runs"),
        _migration_20260308_005,
    ),
]


def migrate_sqlite_or_raise(db_path: str) -> None:
    db_file = Path(db_path)
    if not db_file.parent.exists():
        msg = (
            f"SQLite directory does not exist: {db_file.parent}. "
            "Create the directory or fix MC_API_DB_PATH/MC_DB_PATH before starting the API."
        )
        raise RuntimeError(msg)

    try:
        with sqlite3.connect(db_path) as db:
            db.execute("PRAGMA foreign_keys = ON")
            db.execute("PRAGMA busy_timeout = 5000")
            quick_check = db.execute("PRAGMA quick_check").fetchone()
            if not quick_check or str(quick_check[0]).lower() != "ok":
                details = quick_check[0] if quick_check else "unknown"
                raise RuntimeError(
                    "SQLite integrity check failed. "
                    f"quick_check={details}. "
                    "Run backup/restore workflow in infra/local-runtime/scripts."
                )

            _create_migration_ledger(db)
            applied = {
                str(row[0])
                for row in db.execute("SELECT version FROM schema_migrations").fetchall()
            }

            for migration, handler in _MIGRATIONS:
                if migration.version in applied:
                    continue
                handler(db)
                db.execute(
                    "INSERT INTO schema_migrations(version, description) VALUES(?, ?)",
                    (migration.version, migration.description),
                )
            db.commit()
    except sqlite3.DatabaseError as exc:
        raise RuntimeError(
            "SQLite database is not readable (possibly corrupt). "
            "Restore from a valid backup and re-run migrations."
        ) from exc
