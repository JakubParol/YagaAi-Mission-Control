from typing import Any

from app.shared.api.errors import ValidationError
from app.shared.db.adapter import DbRow, SqlTextSession

DbConnection = SqlTextSession


def _parse_sort(raw: str, allowed: set[str]) -> str:
    clauses: list[str] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if part.startswith("-"):
            field = part[1:]
            direction = "DESC"
        else:
            field = part
            direction = "ASC"
        if field not in allowed:
            raise ValidationError(
                f"Invalid sort field '{field}'. Allowed: {', '.join(sorted(allowed))}"
            )
        clauses.append(field + " " + direction)
    return ", ".join(clauses) if clauses else "created_at DESC"


def _parse_sort_mapped(raw: str, allowed: dict[str, str], default_sql: str) -> str:
    clauses: list[str] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if part.startswith("-"):
            field = part[1:]
            direction = "DESC"
        else:
            field = part
            direction = "ASC"
        expr = allowed.get(field)
        if expr is None:
            raise ValidationError(
                f"Invalid sort field '{field}'. Allowed: {', '.join(sorted(allowed.keys()))}"
            )
        clauses.append(expr + " " + direction)
    return ", ".join(clauses) if clauses else default_sql


def _build_list_queries(
    table: str, where_parts: list[str], order_sql: str | None = None
) -> tuple[str, str]:
    where = (" WHERE " + " AND ".join(where_parts)) if where_parts else ""
    count_q = "SELECT COUNT(*) FROM " + table + where
    select_q = "SELECT * FROM " + table + where
    if order_sql:
        select_q += " ORDER BY " + order_sql
    select_q += " LIMIT ? OFFSET ?"
    return count_q, select_q


def _build_update_query(table: str, sets: list[str]) -> str:
    return "UPDATE " + table + " SET " + ", ".join(sets) + " WHERE id = ?"


async def _fetch_count(db: DbConnection, sql: str, params: list[Any]) -> int:
    cursor = await db.execute(sql, params)
    row = await cursor.fetchone()
    return row[0] if row else 0


async def _fetch_one(db: DbConnection, sql: str, params: list[Any]) -> DbRow | None:
    cursor = await db.execute(sql, params)
    return await cursor.fetchone()


async def _fetch_all(db: DbConnection, sql: str, params: list[Any]) -> list[DbRow]:
    cursor = await db.execute(sql, params)
    return list(await cursor.fetchall())


async def _exists(db: DbConnection, sql: str, params: list[Any]) -> bool:
    cursor = await db.execute(sql, params)
    row = await cursor.fetchone()
    return row is not None
