import sqlite3
from collections.abc import AsyncGenerator

import aiosqlite

from app.config import settings


async def _ensure_agent_columns(db: aiosqlite.Connection) -> None:
    """Add new nullable columns for agents on legacy DB files."""
    cursor = await db.execute("PRAGMA table_info(agents)")
    columns = await cursor.fetchall()
    await cursor.close()
    existing = {str(row["name"]) for row in columns}
    required = {
        "avatar": "TEXT",
        "last_name": "TEXT",
        "initials": "TEXT",
    }

    missing = [name for name in required if name not in existing]
    if not missing:
        return

    try:
        for name in missing:
            await db.execute(f"ALTER TABLE agents ADD COLUMN {name} {required[name]}")
        await db.commit()
    except sqlite3.OperationalError as exc:
        # Ignore races/no-table cases; request handlers will still fail loudly if schema is invalid.
        lowered = str(exc).lower()
        if "duplicate column name" in lowered or "no such table" in lowered:
            return
        raise


async def _ensure_story_columns(db: aiosqlite.Connection) -> None:
    """Add new nullable columns for stories on legacy DB files."""
    cursor = await db.execute("PRAGMA table_info(stories)")
    columns = await cursor.fetchall()
    await cursor.close()
    existing = {str(row["name"]) for row in columns}
    required = {
        "current_assignee_agent_id": "TEXT",
    }

    missing = [name for name in required if name not in existing]
    if not missing:
        return

    try:
        for name in missing:
            await db.execute(f"ALTER TABLE stories ADD COLUMN {name} {required[name]}")
        await db.commit()
    except sqlite3.OperationalError as exc:
        lowered = str(exc).lower()
        if "duplicate column name" in lowered or "no such table" in lowered:
            return
        raise


async def _ensure_backlog_columns(db: aiosqlite.Connection) -> None:
    """Add new columns for backlogs on legacy DB files."""
    cursor = await db.execute("PRAGMA table_info(backlogs)")
    columns = await cursor.fetchall()
    await cursor.close()
    existing = {str(row["name"]) for row in columns}

    if "display_order" in existing:
        return

    try:
        await db.execute(
            "ALTER TABLE backlogs ADD COLUMN display_order INTEGER NOT NULL DEFAULT 1000"
        )
        await db.execute("""
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
        await db.commit()
    except sqlite3.OperationalError as exc:
        lowered = str(exc).lower()
        if "duplicate column name" in lowered or "no such table" in lowered:
            return
        raise


async def _ensure_backlog_indexes(db: aiosqlite.Connection) -> None:
    """Ensure backlog uniqueness and ordering indexes exist."""
    try:
        await db.execute("""
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
        await db.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_backlogs_one_default_per_project
              ON backlogs(project_id)
              WHERE project_id IS NOT NULL AND is_default = 1
            """)
        await db.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_backlogs_one_active_sprint_per_project
              ON backlogs(project_id)
              WHERE project_id IS NOT NULL AND kind = 'SPRINT' AND status = 'ACTIVE'
            """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_backlogs_project_display_order
              ON backlogs(project_id, display_order)
            """)
        await db.commit()
    except sqlite3.OperationalError as exc:
        lowered = str(exc).lower()
        if "no such table" in lowered:
            return
        raise


async def _ensure_activity_log_table(db: aiosqlite.Connection) -> None:
    try:
        await db.execute("""
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
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_activity_log_entity
              ON activity_log(entity_type, entity_id, occurred_at)
            """)
        await db.commit()
    except sqlite3.OperationalError as exc:
        lowered = str(exc).lower()
        if "no such table" in lowered:
            return
        raise


async def get_db() -> AsyncGenerator[aiosqlite.Connection, None]:
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = sqlite3.Row
        await db.execute("PRAGMA foreign_keys = ON")
        await _ensure_agent_columns(db)
        await _ensure_story_columns(db)
        await _ensure_backlog_columns(db)
        await _ensure_backlog_indexes(db)
        await _ensure_activity_log_table(db)
        yield db
