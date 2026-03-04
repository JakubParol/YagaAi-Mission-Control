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


async def get_db() -> AsyncGenerator[aiosqlite.Connection, None]:
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = sqlite3.Row
        await db.execute("PRAGMA foreign_keys = ON")
        await _ensure_agent_columns(db)
        yield db
