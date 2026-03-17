import math
from datetime import UTC, datetime

from app.control_plane.application.ports import ReadModelRepository
from app.control_plane.domain.models import (
    ControlPlaneHealthMetrics,
    RunAttemptReadModel,
    RunReadModel,
    RunStatus,
    TimelineEntryReadModel,
)
from app.shared.api.errors import NotFoundError, ValidationError


class RunReadModelService:
    def __init__(self, repo: ReadModelRepository) -> None:
        self._repo = repo

    async def list_runs(
        self,
        *,
        run_id: str | None,
        status: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[RunReadModel], int]:
        parsed_status = self._parse_status(status)
        return await self._repo.list_runs(
            run_id=run_id,
            status=parsed_status,
            limit=limit,
            offset=offset,
        )

    async def get_run(self, *, run_id: str) -> RunReadModel:
        run = await self._repo.get_run_read_model(run_id=run_id)
        if run is None:
            raise NotFoundError(f"Run {run_id} not found")
        return run

    async def list_timeline_entries(
        self,
        *,
        run_id: str | None,
        run_status: str | None,
        event_type: str | None,
        occurred_after: str | None,
        occurred_before: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[TimelineEntryReadModel], int]:
        parsed_status = self._parse_status(run_status)
        self._validate_timestamp(value=occurred_after, field="occurred_after")
        self._validate_timestamp(value=occurred_before, field="occurred_before")
        return await self._repo.list_timeline_entries(
            run_id=run_id,
            run_status=parsed_status,
            event_type=event_type,
            occurred_after=occurred_after,
            occurred_before=occurred_before,
            limit=limit,
            offset=offset,
        )

    async def list_run_attempts(
        self,
        *,
        run_id: str,
        limit: int,
        offset: int,
    ) -> tuple[list[RunAttemptReadModel], int]:
        run = await self._repo.get_run_read_model(run_id=run_id)
        if run is None:
            raise NotFoundError(f"Run {run_id} not found")
        return await self._repo.list_run_attempts(run_id=run_id, limit=limit, offset=offset)

    async def get_health_metrics(self) -> ControlPlaneHealthMetrics:
        snapshot = await self._repo.get_health_snapshot()
        generated_at = datetime.now(tz=UTC).isoformat().replace("+00:00", "Z")
        queue_oldest_pending_age_seconds = self._age_seconds(snapshot.queue_oldest_pending_at)
        run_latency_avg_ms = self._average(snapshot.run_latencies_ms)
        run_latency_p95_ms = self._percentile(snapshot.run_latencies_ms, 0.95)
        return ControlPlaneHealthMetrics(
            queue_pending=snapshot.queue_pending,
            queue_oldest_pending_age_seconds=queue_oldest_pending_age_seconds,
            retries_total=snapshot.retries_total,
            dead_letter_total=snapshot.dead_letter_total,
            watchdog_interventions=snapshot.watchdog_interventions,
            run_latency_avg_ms=run_latency_avg_ms,
            run_latency_p95_ms=run_latency_p95_ms,
            generated_at=generated_at,
        )

    def _parse_status(self, value: str | None) -> RunStatus | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        if not normalized:
            return None
        try:
            return RunStatus(normalized)
        except ValueError as exc:
            raise ValidationError(
                "Invalid run status",
                details=[
                    {
                        "field": "status",
                        "message": (
                            "status must be one of: " "PENDING,RUNNING,SUCCEEDED,FAILED,CANCELLED"
                        ),
                    }
                ],
            ) from exc

    def _validate_timestamp(self, *, value: str | None, field: str) -> None:
        if value is None:
            return
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValidationError(
                "Invalid timestamp",
                details=[{"field": field, "message": "must be a valid ISO-8601 timestamp"}],
            ) from exc

    def _age_seconds(self, value: str | None) -> int | None:
        if value is None:
            return None
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        now = datetime.now(tz=UTC)
        return max(int((now - parsed.astimezone(UTC)).total_seconds()), 0)

    def _average(self, values: list[float]) -> float | None:
        if not values:
            return None
        return round(sum(values) / len(values), 3)

    def _percentile(self, values: list[float], ratio: float) -> float | None:
        if not values:
            return None
        sorted_values = sorted(values)
        index = max(math.ceil(len(sorted_values) * ratio) - 1, 0)
        return round(sorted_values[index], 3)
