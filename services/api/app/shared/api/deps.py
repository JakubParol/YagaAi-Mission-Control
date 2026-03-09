import asyncio
import logging
import sqlite3
from collections.abc import AsyncGenerator
from contextlib import suppress
from typing import Any

import aiosqlite
import psycopg
from psycopg.pq import TransactionStatus

from app.config import settings
from app.shared.db.pg_compat import AsyncPgCompatConnection

logger = logging.getLogger(__name__)


class _AsyncPgConnectionPool:
    def __init__(self, dsn: str, *, max_size: int) -> None:
        self._dsn = dsn
        self._max_size = max_size
        self._opened = 0
        self._idle: asyncio.LifoQueue[psycopg.AsyncConnection[Any]] = asyncio.LifoQueue()
        self._lock = asyncio.Lock()
        self._closed = False

    async def _create_connection(self) -> psycopg.AsyncConnection[Any]:
        conn = await psycopg.AsyncConnection.connect(self._dsn)
        self._opened += 1
        return conn

    async def acquire(self) -> psycopg.AsyncConnection[Any]:
        if self._closed:
            msg = "Postgres connection pool is closed"
            raise RuntimeError(msg)

        with suppress(asyncio.QueueEmpty):
            return self._idle.get_nowait()

        async with self._lock:
            if self._closed:
                msg = "Postgres connection pool is closed"
                raise RuntimeError(msg)

            with suppress(asyncio.QueueEmpty):
                return self._idle.get_nowait()

            if self._opened < self._max_size:
                return await self._create_connection()

        return await self._idle.get()

    async def _close_connection(self, conn: psycopg.AsyncConnection[Any]) -> None:
        if not conn.closed:
            await conn.close()
        async with self._lock:
            self._opened = max(0, self._opened - 1)

    async def release(self, conn: psycopg.AsyncConnection[Any], *, discard: bool = False) -> None:
        if discard or self._closed or conn.closed:
            await self._close_connection(conn)
            return

        try:
            if conn.info.transaction_status != TransactionStatus.IDLE:
                await conn.rollback()
        except Exception:
            await self._close_connection(conn)
            return

        self._idle.put_nowait(conn)

    async def close(self) -> None:
        self._closed = True
        while True:
            try:
                conn = self._idle.get_nowait()
            except asyncio.QueueEmpty:
                break
            await self._close_connection(conn)


_postgres_pool: _AsyncPgConnectionPool | None = None


async def init_postgres_pool() -> None:
    if settings.db_engine != "postgres":
        return

    global _postgres_pool
    if _postgres_pool is not None:
        return

    _postgres_pool = _AsyncPgConnectionPool(
        settings.postgres_dsn,
        max_size=settings.postgres_pool_max_size,
    )
    logger.info(
        "Postgres connection pool initialized", extra={"max_size": settings.postgres_pool_max_size}
    )


async def close_postgres_pool() -> None:
    global _postgres_pool
    if _postgres_pool is None:
        return
    await _postgres_pool.close()
    _postgres_pool = None


def _require_postgres_pool() -> _AsyncPgConnectionPool:
    if _postgres_pool is None:
        msg = "Postgres pool is not initialized"
        raise RuntimeError(msg)
    return _postgres_pool


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


async def get_db() -> AsyncGenerator[Any, None]:
    if settings.db_engine == "postgres":
        if _postgres_pool is None:
            await init_postgres_pool()
        pool = _require_postgres_pool()
        conn = await pool.acquire()
        db = AsyncPgCompatConnection(conn)
        discard_conn = False

        # SQLite-specific guard (index repair + duplicate active sprint fix)
        # is intentionally skipped for PostgreSQL to avoid per-request DDL churn.
        try:
            yield db
        except Exception:
            try:
                await db.rollback()
            except Exception:
                discard_conn = True
            raise
        else:
            try:
                await db.commit()
            except Exception:
                discard_conn = True
                raise
        finally:
            await pool.release(conn, discard=discard_conn)
        return

    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = sqlite3.Row
        await db.execute("PRAGMA foreign_keys = ON")
        await _ensure_backlog_runtime_guard(db)
        yield db
