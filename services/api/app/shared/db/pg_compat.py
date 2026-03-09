from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any

import psycopg


@dataclass
class CompatRow:
    _keys: list[str]
    _values: list[Any]

    def __getitem__(self, key: int | str) -> Any:
        if isinstance(key, int):
            return self._values[key]
        idx = self._keys.index(key)
        return self._values[idx]

    def keys(self) -> list[str]:
        return list(self._keys)

    def get(self, key: str, default: Any = None) -> Any:
        if key in self._keys:
            return self[key]
        return default


class _NullCursor:
    rowcount = 0
    lastrowid: int | None = None

    async def fetchone(self) -> Any:
        return None

    async def fetchall(self) -> list[Any]:
        return []

    async def fetchmany(self, size: int = 1) -> list[Any]:
        return []

    async def close(self) -> None:
        return None


class AsyncPgCompatCursor:
    def __init__(
        self,
        cursor: psycopg.AsyncCursor[Any],
        *,
        lastrowid: int | None = None,
    ) -> None:
        self._cursor = cursor
        self.lastrowid = lastrowid

    @property
    def rowcount(self) -> int:
        return int(self._cursor.rowcount or 0)

    def _wrap(self, row: Any) -> Any:
        if row is None:
            return None
        if isinstance(row, CompatRow):
            return row
        cols = [desc.name for desc in (self._cursor.description or [])]
        if isinstance(row, dict):
            keys = list(row.keys())
            values = [row[k] for k in keys]
            return CompatRow(keys, values)
        if isinstance(row, tuple):
            keys = cols if cols else [str(i) for i in range(len(row))]
            return CompatRow(keys, list(row))
        return row

    async def fetchone(self) -> Any:
        row = await self._cursor.fetchone()
        return self._wrap(row)

    async def fetchall(self) -> list[Any]:
        rows = await self._cursor.fetchall()
        return [self._wrap(r) for r in rows]

    async def fetchmany(self, size: int = 1) -> list[Any]:
        rows = await self._cursor.fetchmany(size)
        return [self._wrap(r) for r in rows]

    async def close(self) -> None:
        await self._cursor.close()


class AsyncPgCompatConnection:
    def __init__(self, conn: psycopg.AsyncConnection[Any]) -> None:
        self._conn = conn
        self.row_factory = CompatRow

    @classmethod
    async def connect(cls, dsn: str) -> "AsyncPgCompatConnection":
        conn = await psycopg.AsyncConnection.connect(dsn)
        return cls(conn)

    async def __aenter__(self) -> "AsyncPgCompatConnection":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.close()

    async def close(self) -> None:
        await self._conn.close()

    async def commit(self) -> None:
        await self._conn.commit()

    async def rollback(self) -> None:
        await self._conn.rollback()

    @staticmethod
    def _translate_query(query: str) -> str:
        q = query.strip()
        upper = q.upper()

        if upper.startswith("PRAGMA "):
            return "-- PRAGMA noop in postgres"

        if "datetime('now', '-7 days')" in q:
            q = q.replace(
                "datetime('now', '-7 days')",
                "to_char((NOW() AT TIME ZONE 'UTC') - INTERVAL '7 days', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')",
            )

        if "julianday('now') - julianday(e.updated_at)" in q:
            q = q.replace(
                "CAST(MAX(0, julianday('now') - julianday(e.updated_at)) AS INTEGER)",
                "GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ((NOW() AT TIME ZONE 'UTC') - (e.updated_at)::timestamptz)) / 86400))::integer",
            )

        if "julianday(terminal_at) - julianday(created_at)" in q:
            q = q.replace(
                "((julianday(terminal_at) - julianday(created_at)) * 86400000.0)",
                "(EXTRACT(EPOCH FROM ((terminal_at)::timestamptz - (created_at)::timestamptz)) * 1000.0)",
            )

        if upper.startswith("INSERT OR REPLACE INTO LANGFUSE_DAILY_METRICS"):
            q = (
                "INSERT INTO langfuse_daily_metrics "
                "(date, model, input_tokens, output_tokens, total_tokens, request_count, total_cost) "
                "VALUES (?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT (date, model) DO UPDATE SET "
                "input_tokens = EXCLUDED.input_tokens, "
                "output_tokens = EXCLUDED.output_tokens, "
                "total_tokens = EXCLUDED.total_tokens, "
                "request_count = EXCLUDED.request_count, "
                "total_cost = EXCLUDED.total_cost"
            )

        if upper.startswith("INSERT OR REPLACE INTO LANGFUSE_REQUESTS"):
            q = (
                "INSERT INTO langfuse_requests "
                "(id, trace_id, name, model, started_at, finished_at, input_tokens, output_tokens, total_tokens, cost, latency_ms) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT (id) DO UPDATE SET "
                "trace_id = EXCLUDED.trace_id, "
                "name = EXCLUDED.name, "
                "model = EXCLUDED.model, "
                "started_at = EXCLUDED.started_at, "
                "finished_at = EXCLUDED.finished_at, "
                "input_tokens = EXCLUDED.input_tokens, "
                "output_tokens = EXCLUDED.output_tokens, "
                "total_tokens = EXCLUDED.total_tokens, "
                "cost = EXCLUDED.cost, "
                "latency_ms = EXCLUDED.latency_ms"
            )

        if upper.startswith("INSERT OR IGNORE INTO ORCHESTRATION_PROCESSED_MESSAGES"):
            q = (
                "INSERT INTO orchestration_processed_messages "
                "(stream_key, consumer_group, message_id, correlation_id, processed_at) "
                "VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT (stream_key, consumer_group, message_id) DO NOTHING"
            )

        if upper.startswith("INSERT INTO ORCHESTRATION_RUN_TIMELINE"):
            q = (
                "INSERT INTO orchestration_run_timeline "
                "(id, run_id, step_id, message_id, event_type, decision, reason_code, reason_message, correlation_id, causation_id, payload_json, occurred_at, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )

        if upper.startswith("INSERT OR IGNORE INTO PROJECT_COUNTERS"):
            q = (
                "INSERT INTO project_counters (project_id, next_number, updated_at) "
                "VALUES (?, 1, ?) "
                "ON CONFLICT (project_id) DO NOTHING"
            )

        # ensure postgres can infer NULL-optional filter types from sqlite style
        q = q.replace("(? IS NULL OR r.run_id = ?)", "(CAST(? AS text) IS NULL OR r.run_id = CAST(? AS text))")
        q = q.replace("(? IS NULL OR r.status = ?)", "(CAST(? AS text) IS NULL OR r.status = CAST(? AS text))")
        q = q.replace("(? IS NULL OR t.run_id = ?)", "(CAST(? AS text) IS NULL OR t.run_id = CAST(? AS text))")
        q = q.replace("(? IS NULL OR t.event_type = ?)", "(CAST(? AS text) IS NULL OR t.event_type = CAST(? AS text))")
        q = q.replace("(? IS NULL OR t.occurred_at >= ?)", "(CAST(? AS text) IS NULL OR t.occurred_at >= CAST(? AS text))")
        q = q.replace("(? IS NULL OR t.occurred_at <= ?)", "(CAST(? AS text) IS NULL OR t.occurred_at <= CAST(? AS text))")

        # sqlite '?' params -> psycopg '%s'
        q = q.replace("?", "%s")
        return q

    @staticmethod
    def _sanitize_params(params: Sequence[Any]) -> list[Any]:
        out: list[Any] = []
        for p in params:
            if isinstance(p, bool):
                out.append(p)
            elif p is None:
                out.append(None)
            elif isinstance(p, (int, float, str, bytes)):
                out.append(p)
            else:
                out.append(str(p))
        return out

    async def execute(self, query: str, params: Sequence[Any] | None = None) -> Any:
        params = self._sanitize_params(params or [])
        translated = self._translate_query(query)

        if translated.startswith("-- PRAGMA noop"):
            return _NullCursor()

        cur = self._conn.cursor()
        lastrowid: int | None = None

        # preserve sqlite cursor.lastrowid behavior used by imports inserts
        stripped = translated.strip().upper()
        if stripped.startswith("INSERT INTO IMPORTS") and "RETURNING" not in stripped:
            translated = translated.rstrip().rstrip(";") + " RETURNING id"
            await cur.execute(translated, params)
            row = await cur.fetchone()
            if row is not None:
                lastrowid = int(row[0])
        else:
            await cur.execute(translated, params)

        return AsyncPgCompatCursor(cur, lastrowid=lastrowid)

    async def executemany(self, query: str, seq_of_params: Iterable[Sequence[Any]]) -> Any:
        translated = self._translate_query(query)
        if translated.startswith("-- PRAGMA noop"):
            return _NullCursor()
        cur = self._conn.cursor()
        params = [self._sanitize_params(p) for p in seq_of_params]
        await cur.executemany(translated, params)
        return AsyncPgCompatCursor(cur)
