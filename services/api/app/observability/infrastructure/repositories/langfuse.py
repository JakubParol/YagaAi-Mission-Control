from datetime import datetime, timezone

from sqlalchemy import and_, func, literal_column, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.functions import coalesce, count
from sqlalchemy.sql.functions import sum as sa_sum

from app.observability.application.ports import LangfuseRepositoryPort
from app.observability.domain.models import (
    DailyMetric,
    ImportRecord,
    LangfuseRequest,
    PaginatedRequests,
)
from app.observability.infrastructure.tables import (
    imports,
    langfuse_daily_metrics,
    langfuse_requests,
)

_i = imports.c
_m = langfuse_daily_metrics.c
_r = langfuse_requests.c


def _row_to_import(row: object) -> ImportRecord:
    return ImportRecord(
        id=row.id,  # type: ignore[union-attr]
        started_at=row.started_at,  # type: ignore[union-attr]
        finished_at=row.finished_at,  # type: ignore[union-attr]
        mode=row.mode,  # type: ignore[union-attr]
        from_timestamp=row.from_timestamp,  # type: ignore[union-attr]
        to_timestamp=row.to_timestamp,  # type: ignore[union-attr]
        status=row.status,  # type: ignore[union-attr]
        error_message=row.error_message,  # type: ignore[union-attr]
    )


def _row_to_daily_metric(row: object) -> DailyMetric:
    return DailyMetric(
        date=row.date,  # type: ignore[union-attr]
        model=row.model,  # type: ignore[union-attr]
        input_tokens=row.input_tokens,  # type: ignore[union-attr]
        output_tokens=row.output_tokens,  # type: ignore[union-attr]
        total_tokens=row.total_tokens,  # type: ignore[union-attr]
        request_count=row.request_count,  # type: ignore[union-attr]
        total_cost=row.total_cost,  # type: ignore[union-attr]
    )


def _row_to_langfuse_request(row: object) -> LangfuseRequest:
    return LangfuseRequest(
        id=row.id,  # type: ignore[union-attr]
        trace_id=row.trace_id,  # type: ignore[union-attr]
        name=row.name,  # type: ignore[union-attr]
        model=row.model,  # type: ignore[union-attr]
        started_at=row.started_at,  # type: ignore[union-attr]
        finished_at=row.finished_at,  # type: ignore[union-attr]
        input_tokens=row.input_tokens,  # type: ignore[union-attr]
        output_tokens=row.output_tokens,  # type: ignore[union-attr]
        total_tokens=row.total_tokens,  # type: ignore[union-attr]
        cost=row.cost,  # type: ignore[union-attr]
        latency_ms=row.latency_ms,  # type: ignore[union-attr]
    )


class DbLangfuseRepository(LangfuseRepositoryPort):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_last_successful_import(self) -> ImportRecord | None:
        result = await self._db.execute(
            select(imports).where(_i.status == "success").order_by(_i.finished_at.desc()).limit(1)
        )
        row = result.first()
        return _row_to_import(row) if row else None

    async def create_import_run(
        self, mode: str, from_timestamp: str | None, to_timestamp: str
    ) -> ImportRecord:
        started_at = datetime.now(timezone.utc).isoformat()
        result = await self._db.execute(
            imports.insert()
            .values(
                started_at=started_at,
                mode=mode,
                from_timestamp=from_timestamp,
                to_timestamp=to_timestamp,
                status="running",
            )
            .returning(_i.id)
        )
        row = result.first()
        await self._db.commit()
        return ImportRecord(
            id=int(row.id) if row else 0,
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
            update(imports)
            .where(_i.id == import_id)
            .values(
                finished_at=finished_at,
                status=status,
                error_message=error_message,
            )
        )
        await self._db.commit()

    async def get_latest_import(self) -> ImportRecord | None:
        result = await self._db.execute(select(imports).order_by(_i.started_at.desc()).limit(1))
        row = result.first()
        return _row_to_import(row) if row else None

    async def get_counts(self) -> dict[str, int]:
        metrics_result = await self._db.execute(select(count()).select_from(langfuse_daily_metrics))
        requests_result = await self._db.execute(select(count()).select_from(langfuse_requests))
        return {
            "metrics": metrics_result.scalar() or 0,
            "requests": requests_result.scalar() or 0,
        }

    async def upsert_daily_metrics(self, metrics: list[DailyMetric]) -> None:
        if not metrics:
            return
        for m in metrics:
            stmt = pg_insert(langfuse_daily_metrics).values(
                date=m.date,
                model=m.model,
                input_tokens=m.input_tokens,
                output_tokens=m.output_tokens,
                total_tokens=m.total_tokens,
                request_count=m.request_count,
                total_cost=m.total_cost,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[_m.date, _m.model],
                set_={
                    "input_tokens": stmt.excluded.input_tokens,
                    "output_tokens": stmt.excluded.output_tokens,
                    "total_tokens": stmt.excluded.total_tokens,
                    "request_count": stmt.excluded.request_count,
                    "total_cost": stmt.excluded.total_cost,
                },
            )
            await self._db.execute(stmt)
        await self._db.commit()

    async def get_daily_metrics(self, from_date: str, to_date: str) -> list[DailyMetric]:
        result = await self._db.execute(
            select(langfuse_daily_metrics)
            .where(and_(_m.date >= from_date, _m.date <= to_date))
            .order_by(_m.date.asc(), _m.model.asc())
        )
        return [_row_to_daily_metric(row) for row in result.all()]

    async def get_metrics_by_time_range(self, from_ts: str, to_ts: str) -> list[DailyMetric]:
        date_expr = func.substr(_r.started_at, 1, 10).label("date")
        result = await self._db.execute(
            select(
                date_expr,
                _r.model,
                sa_sum(_r.input_tokens).label("input_tokens"),
                sa_sum(_r.output_tokens).label("output_tokens"),
                sa_sum(_r.total_tokens).label("total_tokens"),
                count().label("request_count"),
                coalesce(sa_sum(_r.cost), 0).label("total_cost"),
            )
            .where(
                and_(
                    _r.started_at >= from_ts,
                    _r.started_at < to_ts,
                    _r.model.isnot(None),
                )
            )
            .group_by(literal_column("date"), _r.model)
            .order_by(literal_column("date").asc(), literal_column("total_cost").desc())
        )
        return [_row_to_daily_metric(row) for row in result.all()]

    async def get_distinct_models(self) -> list[str]:
        result = await self._db.execute(
            select(_r.model).where(_r.model.isnot(None)).distinct().order_by(_r.model.asc())
        )
        return [str(row[0]) for row in result.all()]

    async def upsert_requests(self, requests: list[LangfuseRequest]) -> None:
        if not requests:
            return
        for r in requests:
            stmt = pg_insert(langfuse_requests).values(
                id=r.id,
                trace_id=r.trace_id,
                name=r.name,
                model=r.model,
                started_at=r.started_at,
                finished_at=r.finished_at,
                input_tokens=r.input_tokens,
                output_tokens=r.output_tokens,
                total_tokens=r.total_tokens,
                cost=r.cost,
                latency_ms=r.latency_ms,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[_r.id],
                set_={
                    "trace_id": stmt.excluded.trace_id,
                    "name": stmt.excluded.name,
                    "model": stmt.excluded.model,
                    "started_at": stmt.excluded.started_at,
                    "finished_at": stmt.excluded.finished_at,
                    "input_tokens": stmt.excluded.input_tokens,
                    "output_tokens": stmt.excluded.output_tokens,
                    "total_tokens": stmt.excluded.total_tokens,
                    "cost": stmt.excluded.cost,
                    "latency_ms": stmt.excluded.latency_ms,
                },
            )
            await self._db.execute(stmt)
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
        conditions = []
        if model:
            conditions.append(_r.model == model)
        if from_date:
            conditions.append(_r.started_at >= from_date)
        if to_date:
            conditions.append(_r.started_at <= to_date)

        where = and_(*conditions) if conditions else literal_column("1=1")

        count_result = await self._db.execute(
            select(count()).select_from(langfuse_requests).where(where)
        )
        total = count_result.scalar() or 0

        data_result = await self._db.execute(
            select(langfuse_requests)
            .where(where)
            .order_by(_r.started_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return PaginatedRequests(
            data=[_row_to_langfuse_request(row) for row in data_result.all()],
            total=total,
        )
