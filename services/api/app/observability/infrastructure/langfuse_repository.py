from datetime import datetime, timezone

import aiosqlite

from app.observability.application.ports import LangfuseRepositoryPort
from app.observability.domain.models import (
    DailyMetric,
    ImportRecord,
    LangfuseRequest,
    PaginatedRequests,
)


class SqliteLangfuseRepository(LangfuseRepositoryPort):
    def __init__(self, db: aiosqlite.Connection) -> None:
        self._db = db

    async def get_last_successful_import(self) -> ImportRecord | None:
        cursor = await self._db.execute(
            "SELECT * FROM imports WHERE status = 'success' ORDER BY finished_at DESC LIMIT 1"
        )
        row = await cursor.fetchone()
        return _row_to_import(row) if row else None

    async def create_import_run(
        self, mode: str, from_timestamp: str | None, to_timestamp: str
    ) -> ImportRecord:
        started_at = datetime.now(timezone.utc).isoformat()
        cursor = await self._db.execute(
            "INSERT INTO imports (started_at, mode, from_timestamp, to_timestamp, status) "
            "VALUES (?, ?, ?, ?, 'running')",
            (started_at, mode, from_timestamp, to_timestamp),
        )
        await self._db.commit()
        return ImportRecord(
            id=cursor.lastrowid or 0,
            started_at=started_at,
            finished_at=None,
            mode=mode,
            from_timestamp=from_timestamp,
            to_timestamp=to_timestamp,
            status="running",
        )

    async def complete_import_run(
        self, import_id: int, status: str, error_message: str | None = None
    ) -> None:
        finished_at = datetime.now(timezone.utc).isoformat()
        await self._db.execute(
            "UPDATE imports SET finished_at = ?, status = ?, error_message = ? WHERE id = ?",
            (finished_at, status, error_message, import_id),
        )
        await self._db.commit()

    async def get_latest_import(self) -> ImportRecord | None:
        cursor = await self._db.execute("SELECT * FROM imports ORDER BY started_at DESC LIMIT 1")
        row = await cursor.fetchone()
        return _row_to_import(row) if row else None

    async def get_counts(self) -> dict[str, int]:
        cursor = await self._db.execute("SELECT COUNT(*) as count FROM langfuse_daily_metrics")
        metrics_row = await cursor.fetchone()
        cursor = await self._db.execute("SELECT COUNT(*) as count FROM langfuse_requests")
        requests_row = await cursor.fetchone()
        return {
            "metrics": metrics_row[0] if metrics_row else 0,
            "requests": requests_row[0] if requests_row else 0,
        }

    async def upsert_daily_metrics(self, metrics: list[DailyMetric]) -> None:
        if not metrics:
            return
        await self._db.executemany(
            "INSERT OR REPLACE INTO langfuse_daily_metrics "
            "(date, model, input_tokens, output_tokens, total_tokens, request_count, total_cost) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    m.date,
                    m.model,
                    m.input_tokens,
                    m.output_tokens,
                    m.total_tokens,
                    m.request_count,
                    m.total_cost,
                )
                for m in metrics
            ],
        )
        await self._db.commit()

    async def get_daily_metrics(self, from_date: str, to_date: str) -> list[DailyMetric]:
        cursor = await self._db.execute(
            "SELECT * FROM langfuse_daily_metrics "
            "WHERE date >= ? AND date <= ? ORDER BY date ASC, model ASC",
            (from_date, to_date),
        )
        rows = await cursor.fetchall()
        return [_row_to_daily_metric(r) for r in rows]

    async def get_metrics_by_time_range(self, from_ts: str, to_ts: str) -> list[DailyMetric]:
        cursor = await self._db.execute(
            "SELECT "
            "  SUBSTR(started_at, 1, 10) AS date, "
            "  model, "
            "  SUM(input_tokens) AS input_tokens, "
            "  SUM(output_tokens) AS output_tokens, "
            "  SUM(total_tokens) AS total_tokens, "
            "  COUNT(*) AS request_count, "
            "  COALESCE(SUM(cost), 0) AS total_cost "
            "FROM langfuse_requests "
            "WHERE started_at >= ? AND started_at < ? AND model IS NOT NULL "
            "GROUP BY date, model "
            "ORDER BY date ASC, total_cost DESC",
            (from_ts, to_ts),
        )
        rows = await cursor.fetchall()
        return [_row_to_daily_metric(r) for r in rows]

    async def get_distinct_models(self) -> list[str]:
        cursor = await self._db.execute(
            "SELECT DISTINCT model FROM langfuse_requests "
            "WHERE model IS NOT NULL ORDER BY model ASC"
        )
        rows = await cursor.fetchall()
        return [r[0] for r in rows]

    async def upsert_requests(self, requests: list[LangfuseRequest]) -> None:
        if not requests:
            return
        await self._db.executemany(
            "INSERT OR REPLACE INTO langfuse_requests "
            "(id, trace_id, name, model, started_at, finished_at, "
            "input_tokens, output_tokens, total_tokens, cost, latency_ms) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    r.id,
                    r.trace_id,
                    r.name,
                    r.model,
                    r.started_at,
                    r.finished_at,
                    r.input_tokens,
                    r.output_tokens,
                    r.total_tokens,
                    r.cost,
                    r.latency_ms,
                )
                for r in requests
            ],
        )
        await self._db.commit()

    async def get_requests(
        self,
        page: int,
        limit: int,
        model: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> PaginatedRequests:
        offset = (page - 1) * limit
        conditions: list[str] = []
        params: list[str | int] = []

        if model:
            conditions.append("model = ?")
            params.append(model)
        if from_date:
            conditions.append("started_at >= ?")
            params.append(from_date)
        if to_date:
            conditions.append("started_at <= ?")
            params.append(to_date)

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        cursor = await self._db.execute(
            f"SELECT * FROM langfuse_requests {where} "  # noqa: S608  # nosec B608
            "ORDER BY started_at DESC LIMIT ? OFFSET ?",
            (*params, limit, offset),
        )
        rows = await cursor.fetchall()

        count_cursor = await self._db.execute(
            f"SELECT COUNT(*) as count FROM langfuse_requests {where}",  # noqa: S608  # nosec B608
            tuple(params),
        )
        count_row = await count_cursor.fetchone()
        total = count_row[0] if count_row else 0

        return PaginatedRequests(
            data=[_row_to_langfuse_request(r) for r in rows],
            total=total,
        )


def _row_to_import(row: aiosqlite.Row) -> ImportRecord:
    return ImportRecord(
        id=row["id"],
        started_at=row["started_at"],
        finished_at=row["finished_at"],
        mode=row["mode"],
        from_timestamp=row["from_timestamp"],
        to_timestamp=row["to_timestamp"],
        status=row["status"],
        error_message=row["error_message"],
    )


def _row_to_daily_metric(row: aiosqlite.Row) -> DailyMetric:
    return DailyMetric(
        date=row["date"],
        model=row["model"],
        input_tokens=row["input_tokens"],
        output_tokens=row["output_tokens"],
        total_tokens=row["total_tokens"],
        request_count=row["request_count"],
        total_cost=row["total_cost"],
    )


def _row_to_langfuse_request(row: aiosqlite.Row) -> LangfuseRequest:
    return LangfuseRequest(
        id=row["id"],
        trace_id=row["trace_id"],
        name=row["name"],
        model=row["model"],
        started_at=row["started_at"],
        finished_at=row["finished_at"],
        input_tokens=row["input_tokens"],
        output_tokens=row["output_tokens"],
        total_tokens=row["total_tokens"],
        cost=row["cost"],
        latency_ms=row["latency_ms"],
    )
