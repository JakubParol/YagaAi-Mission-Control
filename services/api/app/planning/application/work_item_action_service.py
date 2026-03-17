from dataclasses import dataclass

from app.planning.application.backlog_service import BacklogService
from app.planning.application.ports import ActivityLogRepository
from app.planning.application.work_item_service import WorkItemService
from app.shared.api.errors import AppError, ValidationError
from app.shared.utils import utc_now


@dataclass
class StatusChangeResult:
    work_item_id: str
    from_status: str
    to_status: str
    changed: bool
    actor_id: str | None
    timestamp: str


@dataclass
class BulkItemResult:
    entity_id: str
    success: bool
    timestamp: str
    error_code: str | None = None
    error_message: str | None = None


@dataclass
class BulkActionResult:
    operation: str
    total: int
    succeeded: int
    failed: int
    results: list[BulkItemResult]


class WorkItemActionService:
    def __init__(
        self,
        *,
        work_item_service: WorkItemService,
        backlog_service: BacklogService,
        activity_log_repo: ActivityLogRepository,
    ) -> None:
        self._wi_service = work_item_service
        self._backlog_service = backlog_service
        self._activity_log_repo = activity_log_repo

    async def change_status(
        self,
        *,
        work_item_id: str,
        status: str,
        actor_id: str | None,
        actor_type: str | None,
    ) -> StatusChangeResult:
        existing, _ = await self._wi_service.get_work_item(work_item_id)
        before = existing.status.value
        updated = await self._wi_service.update_work_item(
            work_item_id, {"status": status}, actor=actor_id
        )
        now = utc_now()
        await self._activity_log_repo.log_event(
            event_name="work_item.status.changed",
            actor_id=actor_id,
            actor_type=actor_type,
            entity_type="work_item",
            entity_id=work_item_id,
            scope={
                "project_id": updated.project_id,
                "work_item_id": work_item_id,
            },
            metadata={
                "from_status": before,
                "to_status": updated.status.value,
                "type": updated.type.value,
            },
            occurred_at=now,
        )
        return StatusChangeResult(
            work_item_id=work_item_id,
            from_status=before,
            to_status=updated.status.value,
            changed=before != updated.status.value,
            actor_id=actor_id,
            timestamp=now,
        )

    async def bulk_update_status(
        self,
        *,
        work_item_ids: list[str],
        status: str,
        actor_id: str | None,
        actor_type: str | None,
    ) -> BulkActionResult:
        if not work_item_ids:
            raise ValidationError(
                "work_item_ids must contain at least one id"
            )

        results: list[BulkItemResult] = []
        for wid in work_item_ids:
            stamp = utc_now()
            try:
                await self.change_status(
                    work_item_id=wid,
                    status=status,
                    actor_id=actor_id,
                    actor_type=actor_type,
                )
                results.append(
                    BulkItemResult(entity_id=wid, success=True, timestamp=stamp)
                )
            except AppError as exc:
                results.append(
                    BulkItemResult(
                        entity_id=wid,
                        success=False,
                        error_code=exc.code,
                        error_message=exc.message,
                        timestamp=stamp,
                    )
                )

        succeeded = sum(1 for r in results if r.success)
        return BulkActionResult(
            operation="BULK_UPDATE_STATUS",
            total=len(results),
            succeeded=succeeded,
            failed=len(results) - succeeded,
            results=results,
        )

    async def bulk_add_to_active_sprint(
        self,
        *,
        project_id: str,
        work_item_ids: list[str],
        actor_id: str | None,
        actor_type: str | None,
    ) -> BulkActionResult:
        return await self._bulk_move_membership(
            project_id=project_id,
            work_item_ids=work_item_ids,
            actor_id=actor_id,
            actor_type=actor_type,
            direction="ADD_TO_ACTIVE_SPRINT",
        )

    async def bulk_remove_from_active_sprint(
        self,
        *,
        project_id: str,
        work_item_ids: list[str],
        actor_id: str | None,
        actor_type: str | None,
    ) -> BulkActionResult:
        return await self._bulk_move_membership(
            project_id=project_id,
            work_item_ids=work_item_ids,
            actor_id=actor_id,
            actor_type=actor_type,
            direction="REMOVE_FROM_ACTIVE_SPRINT",
        )

    async def _bulk_move_membership(
        self,
        *,
        project_id: str,
        work_item_ids: list[str],
        actor_id: str | None,
        actor_type: str | None,
        direction: str,
    ) -> BulkActionResult:
        if not work_item_ids:
            raise ValidationError(
                "work_item_ids must contain at least one id"
            )

        results: list[BulkItemResult] = []
        for wid in work_item_ids:
            stamp = utc_now()
            try:
                if direction == "ADD_TO_ACTIVE_SPRINT":
                    move = await self._backlog_service.move_item_to_active_sprint(
                        project_id=project_id, work_item_id=wid
                    )
                    event_name = "work_item.sprint_membership.added"
                else:
                    move = await self._backlog_service.move_item_to_product_backlog(
                        project_id=project_id, work_item_id=wid
                    )
                    event_name = "work_item.sprint_membership.removed"

                await self._activity_log_repo.log_event(
                    event_name=event_name,
                    actor_id=actor_id,
                    actor_type=actor_type,
                    entity_type="work_item",
                    entity_id=wid,
                    scope={
                        "project_id": project_id,
                        "work_item_id": wid,
                        "source_backlog_id": move["source_backlog_id"],
                        "target_backlog_id": move["target_backlog_id"],
                    },
                    metadata={"moved": move["moved"], "bulk": True},
                    occurred_at=stamp,
                )
                results.append(
                    BulkItemResult(entity_id=wid, success=True, timestamp=stamp)
                )
            except AppError as exc:
                error_code = exc.code
                if "No active sprint found" in exc.message:
                    error_code = "NO_ACTIVE_SPRINT"
                results.append(
                    BulkItemResult(
                        entity_id=wid,
                        success=False,
                        error_code=error_code,
                        error_message=exc.message,
                        timestamp=stamp,
                    )
                )

        succeeded = sum(1 for r in results if r.success)
        return BulkActionResult(
            operation=direction,
            total=len(results),
            succeeded=succeeded,
            failed=len(results) - succeeded,
            results=results,
        )
