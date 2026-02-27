import sqlite3
from collections.abc import AsyncGenerator

import aiosqlite

from app.config import settings


async def get_db() -> AsyncGenerator[aiosqlite.Connection, None]:
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = sqlite3.Row
        yield db
