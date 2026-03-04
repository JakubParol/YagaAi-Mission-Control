import sqlite3
from collections.abc import AsyncGenerator

import aiosqlite

from app.config import settings


async def _ensure_avatar_column(db: aiosqlite.Connection) -> None:
    """Add agents.avatar for older DB files that predate avatar support."""
    cursor = await db.execute("PRAGMA table_info(agents)")
    columns = await cursor.fetchall()
    await cursor.close()
    has_avatar = any(row["name"] == "avatar" for row in columns)
    if has_avatar:
        return

    try:
        await db.execute("ALTER TABLE agents ADD COLUMN avatar TEXT")
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
        await _ensure_avatar_column(db)
        yield db
