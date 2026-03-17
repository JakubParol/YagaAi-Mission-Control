import json
from typing import Any, cast

from sqlalchemy import and_, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.control_plane.application.ports import RunRepository
from app.control_plane.domain.models import (
    ControlPlaneRun,
    ControlPlaneStep,
    RunStatus,
    RunTimelineEntry,
    StepStatus,
)
from app.control_plane.infrastructure.shared.mappers import run_from_row, step_from_row
from app.control_plane.infrastructure.tables import (
    control_plane_run_steps,
    control_plane_run_timeline,
    control_plane_runs,
)

_r = control_plane_runs.c
_s = control_plane_run_steps.c
_t = control_plane_run_timeline.c


def _json_compact(data: object) -> str:
    return json.dumps(data, separators=(",", ":"), sort_keys=True)


class DbRunRepository(RunRepository):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_run(self, *, run_id: str) -> ControlPlaneRun | None:
        result = await self._db.execute(
            select(control_plane_runs).where(_r.run_id == run_id).limit(1)
        )
        row = result.first()
        return run_from_row(row) if row else None

    async def create_run(self, *, run: ControlPlaneRun) -> None:
        await self._db.execute(
            control_plane_runs.insert().values(
                run_id=run.run_id,
                status=run.status.value,
                correlation_id=run.correlation_id,
                current_step_id=run.current_step_id,
                last_event_type=run.last_event_type,
                created_at=run.created_at,
                updated_at=run.updated_at,
                run_type=run.run_type,
                lease_owner=run.lease_owner,
                lease_token=run.lease_token,
                last_heartbeat_at=run.last_heartbeat_at,
                watchdog_timeout_at=run.watchdog_timeout_at,
                watchdog_attempt=run.watchdog_attempt,
                watchdog_state=run.watchdog_state,
                terminal_at=run.terminal_at,
            )
        )
        await self._db.commit()

    async def update_run_status(
        self,
        *,
        run_id: str,
        status: RunStatus,
        current_step_id: str | None,
        last_event_type: str,
        updated_at: str,
        terminal_at: str | None,
    ) -> None:
        await self._db.execute(
            update(control_plane_runs)
            .where(_r.run_id == run_id)
            .values(
                status=status.value,
                current_step_id=current_step_id,
                last_event_type=last_event_type,
                updated_at=updated_at,
                terminal_at=terminal_at,
            )
        )
        await self._db.commit()

    async def list_in_flight_runs(self) -> list[ControlPlaneRun]:
        result = await self._db.execute(
            select(control_plane_runs)
            .where(_r.status.in_(["PENDING", "RUNNING"]))
            .order_by(_r.created_at.asc(), _r.run_id.asc())
        )
        return [run_from_row(row) for row in result.all()]

    async def get_step(self, *, run_id: str, step_id: str) -> ControlPlaneStep | None:
        result = await self._db.execute(
            select(control_plane_run_steps)
            .where(and_(_s.run_id == run_id, _s.step_id == step_id))
            .limit(1)
        )
        row = result.first()
        return step_from_row(row) if row else None

    async def create_step(self, *, step: ControlPlaneStep) -> None:
        await self._db.execute(
            control_plane_run_steps.insert().values(
                step_id=step.step_id,
                run_id=step.run_id,
                status=step.status.value,
                last_event_type=step.last_event_type,
                created_at=step.created_at,
                updated_at=step.updated_at,
                terminal_at=step.terminal_at,
            )
        )
        await self._db.commit()

    async def update_step_status(
        self,
        *,
        run_id: str,
        step_id: str,
        status: StepStatus,
        last_event_type: str,
        updated_at: str,
        terminal_at: str | None,
    ) -> None:
        await self._db.execute(
            update(control_plane_run_steps)
            .where(and_(_s.run_id == run_id, _s.step_id == step_id))
            .values(
                status=status.value,
                last_event_type=last_event_type,
                updated_at=updated_at,
                terminal_at=terminal_at,
            )
        )
        await self._db.commit()

    async def append_timeline_entry(self, *, entry: RunTimelineEntry) -> None:
        await self._db.execute(
            control_plane_run_timeline.insert().values(
                id=entry.id,
                run_id=entry.run_id,
                step_id=entry.step_id,
                message_id=entry.message_id,
                event_type=entry.event_type,
                decision=entry.decision.value,
                reason_code=entry.reason_code,
                reason_message=entry.reason_message,
                correlation_id=entry.correlation_id,
                causation_id=entry.causation_id,
                payload_json=_json_compact(entry.payload),
                occurred_at=entry.occurred_at,
                created_at=entry.created_at,
            )
        )
        await self._db.commit()

    async def compare_and_set_run_lease(
        self,
        *,
        run_id: str,
        expected_lease_token: str | None,
        lease_owner: str | None,
        new_lease_token: str | None,
        heartbeat_at: str | None,
        timeout_at: str | None,
        updated_at: str,
    ) -> bool:
        condition = (
            and_(_r.run_id == run_id, _r.lease_token.is_(None))
            if expected_lease_token is None
            else and_(_r.run_id == run_id, _r.lease_token == expected_lease_token)
        )
        result = cast(
            CursorResult[Any],
            await self._db.execute(
                update(control_plane_runs)
                .where(condition)
                .values(
                    lease_owner=lease_owner,
                    lease_token=new_lease_token,
                    last_heartbeat_at=heartbeat_at,
                    watchdog_timeout_at=timeout_at,
                    updated_at=updated_at,
                )
            ),
        )
        await self._db.commit()
        return int(result.rowcount or 0) > 0

    async def apply_watchdog_action_if_lease_matches(
        self,
        *,
        run_id: str,
        expected_lease_token: str | None,
        next_status: RunStatus,
        current_step_id: str | None,
        last_event_type: str,
        updated_at: str,
        terminal_at: str | None,
        watchdog_attempt: int,
        watchdog_state: str,
        clear_lease: bool,
    ) -> bool:
        lease_owner = None if clear_lease else "watchdog"
        lease_token = None if clear_lease else expected_lease_token
        heartbeat_at = None if clear_lease else updated_at
        condition = (
            and_(_r.run_id == run_id, _r.lease_token.is_(None))
            if expected_lease_token is None
            else and_(_r.run_id == run_id, _r.lease_token == expected_lease_token)
        )
        result = cast(
            CursorResult[Any],
            await self._db.execute(
                update(control_plane_runs)
                .where(condition)
                .values(
                    status=next_status.value,
                    current_step_id=current_step_id,
                    last_event_type=last_event_type,
                    updated_at=updated_at,
                    terminal_at=terminal_at,
                    watchdog_attempt=watchdog_attempt,
                    watchdog_state=watchdog_state,
                    lease_owner=lease_owner,
                    lease_token=lease_token,
                    last_heartbeat_at=heartbeat_at,
                )
            ),
        )
        await self._db.commit()
        return int(result.rowcount or 0) > 0
