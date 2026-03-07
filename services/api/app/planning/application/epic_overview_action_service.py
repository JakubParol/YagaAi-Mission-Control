from dataclasses import dataclass

from app.planning.application.backlog_service import BacklogService
from app.planning.application.epic_service import EpicService
from app.planning.application.ports import ActivityLogRepository
from app.planning.application.story_service import StoryService
from app.shared.api.errors import AppError, ValidationError
from app.shared.utils import utc_now


@dataclass
class EpicStatusChangeResult:
    epic_id: str
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


class EpicOverviewActionService:
    def __init__(
        self,
        *,
        epic_service: EpicService,
        story_service: StoryService,
        backlog_service: BacklogService,
        activity_log_repo: ActivityLogRepository,
    ) -> None:
        self._epic_service = epic_service
        self._story_service = story_service
        self._backlog_service = backlog_service
        self._activity_log_repo = activity_log_repo

    async def change_epic_status(
        self,
        *,
        epic_id: str,
        status: str,
        actor_id: str | None,
        actor_type: str | None,
    ) -> EpicStatusChangeResult:
        existing, _ = await self._epic_service.get_epic(epic_id)
        before = existing.status.value
        updated = await self._epic_service.update_epic(
            epic_id,
            {"status": status},
            actor=actor_id,
        )
        now = utc_now()
        await self._activity_log_repo.log_event(
            event_name="epic.status.changed",
            actor_id=actor_id,
            actor_type=actor_type,
            entity_type="epic",
            entity_id=epic_id,
            scope={
                "flow": "epic_overview",
                "project_id": updated.project_id,
                "epic_id": epic_id,
            },
            metadata={"from_status": before, "to_status": updated.status.value},
            occurred_at=now,
        )
        return EpicStatusChangeResult(
            epic_id=epic_id,
            from_status=before,
            to_status=updated.status.value,
            changed=before != updated.status.value,
            actor_id=actor_id,
            timestamp=now,
        )

    async def bulk_update_story_status(
        self,
        *,
        story_ids: list[str],
        status: str,
        actor_id: str | None,
        actor_type: str | None,
    ) -> BulkActionResult:
        if not story_ids:
            raise ValidationError("story_ids must contain at least one story id")

        results: list[BulkItemResult] = []
        for story_id in story_ids:
            stamp = utc_now()
            try:
                before_story, _ = await self._story_service.get_story(story_id)
                updated = await self._story_service.update_story(
                    story_id,
                    {"status": status},
                    actor=actor_id,
                )
                await self._activity_log_repo.log_event(
                    event_name="story.status.changed",
                    actor_id=actor_id,
                    actor_type=actor_type,
                    entity_type="story",
                    entity_id=story_id,
                    scope={
                        "flow": "epic_overview",
                        "project_id": updated.project_id,
                        "story_id": story_id,
                    },
                    metadata={
                        "from_status": before_story.status.value,
                        "to_status": updated.status.value,
                        "bulk": True,
                    },
                    occurred_at=stamp,
                )
                results.append(BulkItemResult(entity_id=story_id, success=True, timestamp=stamp))
            except AppError as exc:
                results.append(
                    BulkItemResult(
                        entity_id=story_id,
                        success=False,
                        error_code=exc.code,
                        error_message=exc.message,
                        timestamp=stamp,
                    )
                )

        succeeded = len([row for row in results if row.success])
        return BulkActionResult(
            operation="BULK_UPDATE_STORY_STATUS",
            total=len(results),
            succeeded=succeeded,
            failed=len(results) - succeeded,
            results=results,
        )

    async def bulk_add_stories_to_active_sprint(
        self,
        *,
        project_id: str,
        story_ids: list[str],
        actor_id: str | None,
        actor_type: str | None,
    ) -> BulkActionResult:
        return await self._bulk_move_story_membership(
            project_id=project_id,
            story_ids=story_ids,
            actor_id=actor_id,
            actor_type=actor_type,
            direction="ADD_TO_ACTIVE_SPRINT",
        )

    async def bulk_remove_stories_from_active_sprint(
        self,
        *,
        project_id: str,
        story_ids: list[str],
        actor_id: str | None,
        actor_type: str | None,
    ) -> BulkActionResult:
        return await self._bulk_move_story_membership(
            project_id=project_id,
            story_ids=story_ids,
            actor_id=actor_id,
            actor_type=actor_type,
            direction="REMOVE_FROM_ACTIVE_SPRINT",
        )

    async def _bulk_move_story_membership(
        self,
        *,
        project_id: str,
        story_ids: list[str],
        actor_id: str | None,
        actor_type: str | None,
        direction: str,
    ) -> BulkActionResult:
        if not story_ids:
            raise ValidationError("story_ids must contain at least one story id")

        results: list[BulkItemResult] = []
        for story_id in story_ids:
            stamp = utc_now()
            try:
                if direction == "ADD_TO_ACTIVE_SPRINT":
                    move_result = await self._backlog_service.move_story_to_active_sprint(
                        project_id=project_id,
                        story_id=story_id,
                        position=None,
                    )
                    event_name = "story.sprint_membership.added"
                else:
                    move_result = await self._backlog_service.move_story_to_product_backlog(
                        project_id=project_id,
                        story_id=story_id,
                        position=None,
                    )
                    event_name = "story.sprint_membership.removed"

                await self._activity_log_repo.log_event(
                    event_name=event_name,
                    actor_id=actor_id,
                    actor_type=actor_type,
                    entity_type="story",
                    entity_id=story_id,
                    scope={
                        "flow": "epic_overview",
                        "project_id": project_id,
                        "story_id": story_id,
                        "source_backlog_id": move_result["source_backlog_id"],
                        "target_backlog_id": move_result["target_backlog_id"],
                    },
                    metadata={"moved": move_result["moved"], "bulk": True},
                    occurred_at=stamp,
                )
                results.append(BulkItemResult(entity_id=story_id, success=True, timestamp=stamp))
            except AppError as exc:
                error_code = exc.code
                if "No active sprint found" in exc.message:
                    error_code = "NO_ACTIVE_SPRINT"
                results.append(
                    BulkItemResult(
                        entity_id=story_id,
                        success=False,
                        error_code=error_code,
                        error_message=exc.message,
                        timestamp=stamp,
                    )
                )

        succeeded = len([row for row in results if row.success])
        return BulkActionResult(
            operation=direction,
            total=len(results),
            succeeded=succeeded,
            failed=len(results) - succeeded,
            results=results,
        )
