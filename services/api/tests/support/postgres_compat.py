from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any, cast

import psycopg
from psycopg.abc import QueryNoTemplate
from psycopg.rows import tuple_row
from sqlalchemy import create_engine

from app.shared.db.metadata import metadata


def _sync_database_url(database_url: str) -> str:
    return database_url.replace("postgresql+psycopg://", "postgresql://")


def _sqlalchemy_database_url(database_url: str) -> str:
    if database_url.startswith("postgresql+psycopg://"):
        return database_url
    return database_url.replace("postgresql://", "postgresql+psycopg://")


@contextmanager
def pg_connect(
    database_url: str,
) -> Iterator[psycopg.Connection[tuple[Any, ...]]]:
    conn: psycopg.Connection[tuple[Any, ...]] = psycopg.connect(
        _sync_database_url(database_url), row_factory=tuple_row
    )
    try:
        yield conn
    finally:
        conn.close()  # pylint: disable=no-member


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
                cast(QueryNoTemplate, query),
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
