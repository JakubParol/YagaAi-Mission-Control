import json
from typing import Any

from sqlalchemy import TIMESTAMP, and_, cast, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.expression import extract
from sqlalchemy.sql.functions import count
from sqlalchemy.sql.functions import min as sa_min

from app.control_plane.application.ports import ReadModelRepository
from app.control_plane.domain.models import (
    ControlPlaneHealthSnapshot,
    RunAttemptReadModel,
    RunReadModel,
    RunStatus,
    TimelineEntryReadModel,
)
from app.control_plane.infrastructure.shared.mappers import (
    run_attempt_from_row,
    run_read_model_from_row,
    timeline_entry_from_row,
)
from app.control_plane.infrastructure.tables import (
    control_plane_outbox,
    control_plane_run_timeline,
    control_plane_runs,
)

_r = control_plane_runs.c
_t = control_plane_run_timeline.c
_o = control_plane_outbox.c


def _build_where(conditions: list[Any]) -> Any:
    return and_(*conditions) if conditions else literal_column("1=1")


class DbReadModelRepository(ReadModelRepository):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_runs(
        self,
        *,
        run_id: str | None,
        status: RunStatus | None,
        limit: int,
        offset: int,
    ) -> tuple[list[RunReadModel], int]:
        conditions = []
        if run_id is not None:
            conditions.append(_r.run_id == run_id)
        if status is not None:
            conditions.append(_r.status == status.value)
        where = _build_where(conditions)

        count_result = await self._db.execute(
            select(count()).select_from(control_plane_runs).where(where)
        )
        total = count_result.scalar() or 0

        causation_subq = (
            select(_t.causation_id)
            .where(_t.run_id == _r.run_id)
            .order_by(_t.occurred_at.desc(), _t.id.desc())
            .limit(1)
            .correlate(control_plane_runs)
            .scalar_subquery()
            .label("causation_id")
        )
        query = (
            select(control_plane_runs, causation_subq)
            .where(where)
            .order_by(_r.updated_at.desc(), _r.run_id.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self._db.execute(query)
        return [run_read_model_from_row(row) for row in result.all()], total

    async def get_run_read_model(self, *, run_id: str) -> RunReadModel | None:
        rows, _ = await self.list_runs(run_id=run_id, status=None, limit=1, offset=0)
        return rows[0] if rows else None

    async def list_timeline_entries(
        self,
        *,
        run_id: str | None,
        run_status: RunStatus | None,
        event_type: str | None,
        occurred_after: str | None,
        occurred_before: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[TimelineEntryReadModel], int]:
        joined = control_plane_run_timeline.join(control_plane_runs, _t.run_id == _r.run_id)
        conditions = []
        if run_id is not None:
            conditions.append(_t.run_id == run_id)
        if run_status is not None:
            conditions.append(_r.status == run_status.value)
        if event_type is not None:
            conditions.append(_t.event_type == event_type)
        if occurred_after is not None:
            conditions.append(_t.occurred_at >= occurred_after)
        if occurred_before is not None:
            conditions.append(_t.occurred_at <= occurred_before)
        where = _build_where(conditions)

        count_result = await self._db.execute(select(count()).select_from(joined).where(where))
        total = count_result.scalar() or 0

        query = (
            select(
                _t.id,
                _t.run_id,
                _r.status.label("run_status"),
                _t.step_id,
                _t.message_id,
                _t.event_type,
                _t.decision,
                _t.reason_code,
                _t.reason_message,
                _t.correlation_id,
                _t.causation_id,
                _t.payload_json,
                _t.occurred_at,
                _t.created_at,
            )
            .select_from(joined)
            .where(where)
            .order_by(_t.occurred_at.desc(), _t.id.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self._db.execute(query)
        entries = []
        for row in result.all():
            payload = json.loads(row.payload_json) if row.payload_json else {}
            entries.append(timeline_entry_from_row(row, payload))
        return entries, total

    async def list_run_attempts(
        self,
        *,
        run_id: str,
        limit: int,
        offset: int,
    ) -> tuple[list[RunAttemptReadModel], int]:
        joined = control_plane_outbox.join(
            control_plane_runs, _o.correlation_id == _r.correlation_id
        )
        where = _r.run_id == run_id

        count_result = await self._db.execute(select(count()).select_from(joined).where(where))
        total = count_result.scalar() or 0

        query = (
            select(
                _o.id,
                _o.command_id,
                _r.run_id,
                _o.event_type,
                _o.occurred_at,
                _o.status,
                _o.retry_attempt,
                _o.max_attempts,
                _o.available_at,
                _o.dead_lettered_at,
                _o.last_error,
                _o.correlation_id,
                _o.causation_id,
            )
            .select_from(joined)
            .where(where)
            .order_by(_o.occurred_at.desc(), _o.id.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self._db.execute(query)
        return [run_attempt_from_row(row) for row in result.all()], total

    async def get_health_snapshot(self) -> ControlPlaneHealthSnapshot:
        pending_result = await self._db.execute(
            select(count(), sa_min(_o.available_at)).where(_o.status == "PENDING")
        )
        pending_row = pending_result.first()
        queue_pending = int(pending_row[0]) if pending_row and pending_row[0] else 0
        queue_oldest = str(pending_row[1]) if pending_row and pending_row[1] else None

        retries_result = await self._db.execute(select(count()).where(_o.retry_attempt > 1))
        retries_total = retries_result.scalar() or 0

        dl_result = await self._db.execute(
            select(count()).where((_o.dead_lettered_at.isnot(None)) | (_o.status == "FAILED"))
        )
        dead_letter_total = dl_result.scalar() or 0

        wd_result = await self._db.execute(
            select(count())
            .select_from(control_plane_run_timeline)
            .where(
                and_(
                    _t.event_type == "control-plane.watchdog.action",
                    _t.decision == "ACCEPTED",
                )
            )
        )
        watchdog_interventions = wd_result.scalar() or 0

        latency_expr = (
            extract(
                "epoch",
                cast(_r.terminal_at, TIMESTAMP(timezone=True)),
            )
            - extract(
                "epoch",
                cast(_r.created_at, TIMESTAMP(timezone=True)),
            )
        ) * 1000.0
        lat_result = await self._db.execute(select(latency_expr).where(_r.terminal_at.isnot(None)))
        run_latencies_ms = [
            float(row[0]) for row in lat_result.all() if row[0] is not None and float(row[0]) >= 0
        ]

        return ControlPlaneHealthSnapshot(
            queue_pending=queue_pending,
            queue_oldest_pending_at=queue_oldest,
            retries_total=retries_total,
            dead_letter_total=dead_letter_total,
            watchdog_interventions=watchdog_interventions,
            run_latencies_ms=run_latencies_ms,
        )
