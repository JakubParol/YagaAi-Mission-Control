from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, cast

from sqlalchemy import text
from sqlalchemy.engine import CursorResult, Row
from sqlalchemy.exc import ResourceClosedError
from sqlalchemy.ext.asyncio import AsyncSession

_INSERT_OR_IGNORE_RE = re.compile(r"^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+", re.IGNORECASE)
_INSERT_OR_REPLACE_RE = re.compile(
    r"^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)\s*VALUES",
    re.IGNORECASE | re.DOTALL,
)
_DATETIME_NOW_OFFSET_RE = re.compile(
    r"datetime\(\s*'now'\s*,\s*'([+-]?\d+)\s+days'\s*\)",
    re.IGNORECASE,
)
_JULIANDAY_DIFF_RE = re.compile(
    r"julianday\(\s*('now'|[^)]+?)\s*\)\s*-\s*julianday\(\s*('now'|[^)]+?)\s*\)",
    re.IGNORECASE,
)
_REPLACE_CONFLICT_TARGETS = {
    "langfuse_daily_metrics": ["date", "model"],
    "langfuse_requests": ["id"],
}


@dataclass
class DbRow:
    _keys: list[str]
    _values: list[Any]

    def __getitem__(self, key: int | str) -> Any:
        if isinstance(key, int):
            return self._values[key]
        return self._values[self._keys.index(key)]

    def keys(self) -> list[str]:
        return list(self._keys)

    def get(self, key: str, default: Any = None) -> Any:
        if key in self._keys:
            return self[key]
        return default

    def __iter__(self):
        return iter(self._values)

    def __len__(self) -> int:
        return len(self._values)

    def __eq__(self, other: object) -> bool:
        if isinstance(other, DbRow):
            return self._values == other._values
        if isinstance(other, (tuple, list)):
            return tuple(self._values) == tuple(other)
        return False


class DbCursor:
    def __init__(
        self,
        *,
        rows: list[DbRow] | None = None,
        rowcount: int = 0,
        lastrowid: int | None = None,
    ) -> None:
        self._rows = rows or []
        self._index = 0
        self.rowcount = rowcount
        self.lastrowid = lastrowid

    async def fetchone(self) -> DbRow | None:
        if self._index >= len(self._rows):
            return None
        row = self._rows[self._index]
        self._index += 1
        return row

    async def fetchall(self) -> list[DbRow]:
        if self._index == 0:
            self._index = len(self._rows)
            return list(self._rows)
        rows = self._rows[self._index :]
        self._index = len(self._rows)
        return rows

    async def fetchmany(self, size: int = 1) -> list[DbRow]:
        if size <= 0:
            return []
        end = min(self._index + size, len(self._rows))
        rows = self._rows[self._index : end]
        self._index = end
        return rows

    async def close(self) -> None:
        return None


def _translate_insert_or_ignore(query: str) -> str:
    if not _INSERT_OR_IGNORE_RE.search(query):
        return query
    translated = _INSERT_OR_IGNORE_RE.sub("INSERT INTO ", query, count=1).rstrip()
    return translated + " ON CONFLICT DO NOTHING"


def _translate_insert_or_replace(query: str) -> str:
    match = _INSERT_OR_REPLACE_RE.match(query)
    if match is None:
        return query

    table_name = match.group(1)
    conflict_target = _REPLACE_CONFLICT_TARGETS.get(table_name)
    if conflict_target is None:
        msg = f"INSERT OR REPLACE is not supported for table '{table_name}'"
        raise ValueError(msg)

    columns = [part.strip() for part in match.group(2).split(",") if part.strip()]
    assignments = [
        f"{column} = EXCLUDED.{column}" for column in columns if column not in conflict_target
    ]
    translated = _INSERT_OR_REPLACE_RE.sub(
        f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES",
        query,
        count=1,
    ).rstrip()
    return (
        translated
        + f" ON CONFLICT ({', '.join(conflict_target)}) DO UPDATE SET "
        + ", ".join(assignments)
    )


def _translate_sqlite_datetime_functions(query: str) -> str:
    def replace_datetime(match: re.Match[str]) -> str:
        days = int(match.group(1))
        sign = "+" if days >= 0 else "-"
        return f"(CURRENT_TIMESTAMP {sign} INTERVAL '{abs(days)} days')"

    def replace_julianday_diff(match: re.Match[str]) -> str:
        left = match.group(1).strip()
        right = match.group(2).strip()

        def normalize_operand(operand: str) -> str:
            if operand.lower() == "'now'":
                return "CURRENT_TIMESTAMP"
            return f"CAST({operand} AS TIMESTAMPTZ)"

        return (
            "EXTRACT(EPOCH FROM ("
            + normalize_operand(left)
            + " - "
            + normalize_operand(right)
            + ")) / 86400.0"
        )

    translated = _DATETIME_NOW_OFFSET_RE.sub(replace_datetime, query)
    return _JULIANDAY_DIFF_RE.sub(replace_julianday_diff, translated)


def _replace_unquoted_qmarks(query: str) -> tuple[str, list[str]]:
    out: list[str] = []
    names: list[str] = []
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
            name = f"p{len(names)}"
            names.append(name)
            out.append(f":{name}")
            idx += 1
            continue

        out.append(char)
        idx += 1

    return "".join(out), names


def _normalize_query(query: str) -> tuple[str, list[str]]:
    translated = _translate_insert_or_ignore(query)
    translated = _translate_insert_or_replace(translated)
    translated = _translate_sqlite_datetime_functions(translated)
    return _replace_unquoted_qmarks(translated)


def _wrap_rows(keys: list[str], rows: list[Row[Any]]) -> list[DbRow]:
    return [DbRow(keys, list(row)) for row in rows]


def _normalize_param_value(value: Any) -> Any:
    if isinstance(value, bool):
        return int(value)
    return value


class SqlTextSession:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def execute(
        self, query: str, params: list[Any] | tuple[Any, ...] | None = None
    ) -> DbCursor:
        sql = query.strip()
        if sql.upper() == "BEGIN":
            return DbCursor()

        normalized_sql, names = _normalize_query(query)
        raw_params = list(params or [])
        if len(names) != len(raw_params):
            msg = f"Expected {len(names)} SQL params, got {len(raw_params)}"
            raise ValueError(msg)
        bind_params = {
            name: _normalize_param_value(raw_params[index]) for index, name in enumerate(names)
        }

        result = cast(
            CursorResult[Any],
            await self._session.execute(text(normalized_sql), bind_params),
        )
        try:
            rows = list(result.fetchall())
            keys = list(result.keys())
        except ResourceClosedError:
            rows = []
            keys = []

        return DbCursor(rows=_wrap_rows(keys, rows), rowcount=int(result.rowcount or 0))

    async def executemany(
        self,
        query: str,
        params: list[list[Any]] | list[tuple[Any, ...]],
    ) -> DbCursor:
        normalized_sql, names = _normalize_query(query)
        bind_params = []
        for row in params:
            raw_row = list(row)
            if len(names) != len(raw_row):
                msg = f"Expected {len(names)} SQL params, got {len(raw_row)}"
                raise ValueError(msg)
            bind_params.append(
                {name: _normalize_param_value(raw_row[index]) for index, name in enumerate(names)}
            )

        result = cast(
            CursorResult[Any],
            await self._session.execute(text(normalized_sql), bind_params),
        )
        return DbCursor(rowcount=int(result.rowcount or 0))

    async def commit(self) -> None:
        await self._session.commit()

    async def rollback(self) -> None:
        await self._session.rollback()
