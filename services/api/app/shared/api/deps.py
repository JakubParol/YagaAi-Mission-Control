import sqlite3
from collections.abc import AsyncGenerator

import aiosqlite

from app.config import settings


async def _ensure_backlog_runtime_guard(db: aiosqlite.Connection) -> None:
    """Repair duplicate active sprints and recreate key indexes if drift occurs at runtime."""
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
            CREATE UNIQUE INDEX IF NOT EXISTS idx_backlogs_one_active_sprint_per_project
              ON backlogs(project_id)
              WHERE project_id IS NOT NULL AND kind = 'SPRINT' AND status = 'ACTIVE'
            """)
        await db.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_backlogs_one_default_per_project
              ON backlogs(project_id)
              WHERE project_id IS NOT NULL AND is_default = 1
            """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_backlogs_project_display_order
              ON backlogs(project_id, display_order)
            """)
        await db.commit()
    except sqlite3.OperationalError as exc:
        if "no such table" in str(exc).lower():
            return
        raise


async def get_db() -> AsyncGenerator[aiosqlite.Connection, None]:
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = sqlite3.Row
        await db.execute("PRAGMA foreign_keys = ON")
        await _ensure_backlog_runtime_guard(db)
        yield db
