import sqlite3
from collections.abc import AsyncIterator

import aiosqlite
from pytest import MonkeyPatch


async def _noop_async() -> None:
    return None


async def _ensure_backlog_runtime_guard(db: aiosqlite.Connection) -> None:
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


def disable_runtime_postgres(monkeypatch: MonkeyPatch) -> None:
    from app.shared.db import session as session_module

    monkeypatch.setattr(session_module, "init_db_engine", _noop_async)
    monkeypatch.setattr(session_module, "close_db_engine", _noop_async)


def override_test_db(app, monkeypatch: MonkeyPatch, db_path: str) -> None:
    from app.shared.api.deps import get_db

    disable_runtime_postgres(monkeypatch)

    async def _override_get_db() -> AsyncIterator[aiosqlite.Connection]:
        async with aiosqlite.connect(db_path) as db:
            db.row_factory = sqlite3.Row
            await db.execute("PRAGMA foreign_keys = ON")
            await _ensure_backlog_runtime_guard(db)
            yield db

    app.dependency_overrides[get_db] = _override_get_db
