from datetime import datetime

from app.orchestration.application.ports import OrchestrationRepository
from app.orchestration.domain.models import (
    RunAttemptReadModel,
    RunReadModel,
    RunStatus,
    TimelineEntryReadModel,
)
from app.shared.api.errors import NotFoundError, ValidationError


class RunReadModelService:
    def __init__(self, repo: OrchestrationRepository) -> None:
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
