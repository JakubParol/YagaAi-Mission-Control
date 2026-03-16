from __future__ import annotations

import re
import sqlite3
from typing import Any, cast

import psycopg
from psycopg.abc import QueryNoTemplate
from psycopg.rows import tuple_row
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError as SqlAlchemyIntegrityError
from sqlalchemy.exc import ProgrammingError as SqlAlchemyProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.shared.db.adapter import DbCursor, SqlTextSession, _translate_sqlite_datetime_functions
from app.shared.db.metadata import metadata

_SQLITE_MASTER_PATTERN = re.compile(
    r"SELECT\s+name\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'index'"
    r"\s+AND\s+name\s*=\s*'([^']+)'",
    re.IGNORECASE,
)


def _sync_database_url(database_url: str) -> str:
    return database_url.replace("postgresql+psycopg://", "postgresql://")


def _sqlalchemy_database_url(database_url: str) -> str:
    if database_url.startswith("postgresql+psycopg://"):
        return database_url
    return database_url.replace("postgresql://", "postgresql+psycopg://")


def _map_db_error(error: psycopg.Error) -> sqlite3.Error:
    sqlstate = getattr(error, "sqlstate", "") or ""
    if sqlstate.startswith("23"):
        return sqlite3.IntegrityError(str(error))
    return sqlite3.OperationalError(str(error))


def _replace_unquoted_qmarks(  # pylint: disable=too-many-branches,too-many-statements
    query: str,
) -> str:
    out: list[str] = []
    in_single_quote = False
    in_double_quote = False
    in_line_comment = False
    in_block_comment = False
    idx = 0

    while idx < len(query):
        char = query[idx]
        nxt = query[idx + 1] if idx + 1 < len(query) else ""

        if in_line_comment:
            out.append(char)
            if char == "\n":
                in_line_comment = False
            idx += 1
            continue

        if in_block_comment:
            out.append(char)
            if char == "*" and nxt == "/":
                out.append(nxt)
                idx += 2
                in_block_comment = False
                continue
            idx += 1
            continue

        if in_single_quote:
            out.append(char)
            if char == "'" and nxt == "'":
                out.append(nxt)
                idx += 2
                continue
            if char == "'":
                in_single_quote = False
            idx += 1
            continue

        if in_double_quote:
            out.append(char)
            if char == '"' and nxt == '"':
                out.append(nxt)
                idx += 2
                continue
            if char == '"':
                in_double_quote = False
            idx += 1
            continue

        if char == "-" and nxt == "-":
            out.extend((char, nxt))
            idx += 2
            in_line_comment = True
            continue

        if char == "/" and nxt == "*":
            out.extend((char, nxt))
            idx += 2
            in_block_comment = True
            continue

        if char == "'":
            out.append(char)
            idx += 1
            in_single_quote = True
            continue

        if char == '"':
            out.append(char)
            idx += 1
            in_double_quote = True
            continue

        if char == "?":
            out.append("%s")
            idx += 1
            continue

        out.append(char)
        idx += 1

    return "".join(out)


def split_sql_script(  # pylint: disable=too-many-branches,too-many-statements
    script: str,
) -> list[str]:
    statements: list[str] = []
    current: list[str] = []
    in_single_quote = False
    in_double_quote = False
    in_line_comment = False
    in_block_comment = False
    idx = 0

    while idx < len(script):
        char = script[idx]
        nxt = script[idx + 1] if idx + 1 < len(script) else ""

        if in_line_comment:
            current.append(char)
            if char == "\n":
                in_line_comment = False
            idx += 1
            continue

        if in_block_comment:
            current.append(char)
            if char == "*" and nxt == "/":
                current.append(nxt)
                idx += 2
                in_block_comment = False
                continue
            idx += 1
            continue

        if char == "-" and nxt == "-":
            current.extend((char, nxt))
            idx += 2
            in_line_comment = True
            continue

        if char == "/" and nxt == "*":
            current.extend((char, nxt))
            idx += 2
            in_block_comment = True
            continue

        if char == "'" and not in_double_quote:
            in_single_quote = not in_single_quote
            current.append(char)
            idx += 1
            continue

        if char == '"' and not in_single_quote:
            in_double_quote = not in_double_quote
            current.append(char)
            idx += 1
            continue

        if char == ";" and not in_single_quote and not in_double_quote:
            statement = "".join(current).strip()
            if statement:
                statements.append(statement)
            current = []
            idx += 1
            continue

        current.append(char)
        idx += 1

    tail = "".join(current).strip()
    if tail:
        statements.append(tail)
    return statements


class SyncCompatCursor:
    def __init__(
        self, cursor: psycopg.Cursor[Any] | None, rows: list[tuple[Any, ...]] | None = None
    ) -> None:
        self._cursor = cursor
        self._rows = rows

    def fetchone(self) -> tuple[Any, ...] | None:
        if self._rows is not None:
            return self._rows[0] if self._rows else None
        if self._cursor is None:
            return None
        return self._cursor.fetchone()

    def fetchall(self) -> list[tuple[Any, ...]]:
        if self._rows is not None:
            return list(self._rows)
        if self._cursor is None:
            return []
        return list(self._cursor.fetchall())

    def close(self) -> None:
        if self._cursor is not None:
            self._cursor.close()


class SyncCompatConnection:  # pylint: disable=no-member
    def __init__(self, database_url: str) -> None:
        self._conn = psycopg.connect(_sync_database_url(database_url), row_factory=tuple_row)

    def _sqlite_master_cursor(self, query: str) -> SyncCompatCursor:
        match = _SQLITE_MASTER_PATTERN.search(query)
        if match is None:
            return SyncCompatCursor(None, [])

        index_name = match.group(1)
        with self._conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT indexname
                FROM pg_indexes
                WHERE schemaname = current_schema() AND indexname = %s
                """,
                [index_name],
            )
            row = cursor.fetchone()
        rows = [row] if row is not None else []
        return SyncCompatCursor(None, rows)

    def execute(
        self,
        query: str,
        params: tuple[Any, ...] | list[Any] | None = None,
    ) -> SyncCompatCursor:
        if query.strip().upper().startswith("PRAGMA "):
            return SyncCompatCursor(None, [])
        if "FROM sqlite_master" in query:
            return self._sqlite_master_cursor(query)

        translated_query = _replace_unquoted_qmarks(_translate_sqlite_datetime_functions(query))
        cursor = self._conn.cursor()
        try:
            cursor.execute(cast(QueryNoTemplate, translated_query), list(params or []))
        except psycopg.Error as error:
            cursor.close()
            raise _map_db_error(error) from error
        return SyncCompatCursor(cursor)

    def commit(self) -> None:
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()


class AsyncCompatConnection:
    def __init__(self, database_url: str) -> None:
        self._engine = create_async_engine(database_url, pool_pre_ping=True)
        self._session_factory = async_sessionmaker(
            self._engine,
            expire_on_commit=False,
            autoflush=False,
            class_=AsyncSession,
        )
        self._session: AsyncSession | None = None
        self._db: SqlTextSession | None = None

    async def __aenter__(self) -> "AsyncCompatConnection":
        self._session = self._session_factory()
        self._db = SqlTextSession(self._session)
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if self._session is not None:
            await self._session.close()
        await self._engine.dispose()

    async def execute(
        self,
        query: str,
        params: tuple[Any, ...] | list[Any] | None = None,
    ) -> DbCursor:
        if self._db is None:
            msg = "AsyncCompatConnection is not opened"
            raise RuntimeError(msg)
        if query.strip().upper().startswith("PRAGMA "):
            return DbCursor()
        try:
            return await self._db.execute(query, list(params or []))
        except SqlAlchemyIntegrityError as error:
            raise sqlite3.IntegrityError(str(error.orig)) from error
        except SqlAlchemyProgrammingError as error:
            raise sqlite3.OperationalError(str(error.orig)) from error

    async def executemany(
        self,
        query: str,
        params: list[tuple[Any, ...]] | list[list[Any]],
    ) -> DbCursor:
        if self._db is None:
            msg = "AsyncCompatConnection is not opened"
            raise RuntimeError(msg)
        try:
            return await self._db.executemany(query, params)
        except SqlAlchemyIntegrityError as error:
            raise sqlite3.IntegrityError(str(error.orig)) from error
        except SqlAlchemyProgrammingError as error:
            raise sqlite3.OperationalError(str(error.orig)) from error

    async def commit(self) -> None:
        if self._db is None:
            msg = "AsyncCompatConnection is not opened"
            raise RuntimeError(msg)
        await self._db.commit()

    async def rollback(self) -> None:
        if self._db is None:
            msg = "AsyncCompatConnection is not opened"
            raise RuntimeError(msg)
        await self._db.rollback()


def sqlite_connect(database_url: str, *args: Any, **kwargs: Any) -> SyncCompatConnection:
    del args, kwargs
    return SyncCompatConnection(database_url)


def aiosqlite_connect(database_url: str, *args: Any, **kwargs: Any) -> AsyncCompatConnection:
    del args, kwargs
    return AsyncCompatConnection(database_url)


def run_script(database_url: str, script: str) -> None:
    with psycopg.connect(_sync_database_url(database_url)) as connection:
        with connection.cursor() as cursor:
            for statement in split_sql_script(script):
                cursor.execute(cast(QueryNoTemplate, statement))
        connection.commit()


def execute_query(
    database_url: str,
    query: str,
    params: list[Any] | tuple[Any, ...] | None = None,
) -> list[tuple[Any, ...]]:
    with psycopg.connect(_sync_database_url(database_url), row_factory=tuple_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                cast(QueryNoTemplate, _replace_unquoted_qmarks(query)),
                list(params or []),
            )
            return list(cursor.fetchall())


def truncate_all_tables(database_url: str, *, table_names: list[str]) -> None:
    with psycopg.connect(_sync_database_url(database_url)) as connection:
        with connection.cursor() as cursor:
            joined = ", ".join(table_names)
            cursor.execute(
                cast(QueryNoTemplate, f"TRUNCATE TABLE {joined} RESTART IDENTITY CASCADE")
            )
        connection.commit()


def reset_database_schema(database_url: str) -> None:
    engine = create_engine(_sqlalchemy_database_url(database_url))
    try:
        metadata.drop_all(bind=engine, checkfirst=True)
        metadata.create_all(bind=engine, checkfirst=True)
    finally:
        engine.dispose()
