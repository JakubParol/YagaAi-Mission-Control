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


_MIGRATIONS: list[tuple[Migration, Callable[[sqlite3.Connection], None]]] = [
    (Migration("20260307_001", "add missing agents profile columns"), _migration_20260307_001),
    (Migration("20260307_002", "add stories.current_assignee_agent_id"), _migration_20260307_002),
    (
        Migration("20260307_003", "backlog display_order + lifecycle indexes"),
        _migration_20260307_003,
    ),
    (Migration("20260307_004", "create activity log table + index"), _migration_20260307_004),
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
            "Restore from backup using infra/local-runtime/scripts/sqlite-restore.sh"
        ) from exc
