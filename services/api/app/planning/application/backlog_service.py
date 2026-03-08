from typing import Any

from app.planning.application.ports import BacklogRepository
from app.planning.domain.models import (
    Backlog,
    BacklogKind,
    BacklogStatus,
    BacklogStoryItem,
    BacklogTaskItem,
)
from app.shared.api.errors import BusinessRuleError, ConflictError, NotFoundError
from app.shared.utils import new_uuid, utc_now

ActiveSprintResult = tuple[Backlog, list[dict[str, Any]]]
StoryMembershipMoveResult = dict[str, Any]


class BacklogService:
    def __init__(self, repo: BacklogRepository) -> None:
        self._repo = repo

    async def list_backlogs(
        self,
        *,
        project_id: str | None = None,
        filter_global: bool = False,
        status: str | None = None,
        kind: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str | None = None,
    ) -> tuple[list[Backlog], int]:
        return await self._repo.list_all(
            project_id=project_id,
            filter_global=filter_global,
            status=status,
            kind=kind,
            limit=limit,
            offset=offset,
            sort=sort,
        )

    async def get_backlog(self, backlog_id: str) -> Backlog:
        backlog = await self._repo.get_by_id(backlog_id)
        if not backlog:
            raise NotFoundError(f"Backlog {backlog_id} not found")
        return backlog

    async def get_backlog_counts(self, backlog_id: str) -> dict[str, int]:
        return {
            "story_count": await self._repo.get_story_count(backlog_id),
            "task_count": await self._repo.get_task_count(backlog_id),
        }

    async def create_backlog(
        self,
        *,
        project_id: str | None = None,
        name: str,
        kind: BacklogKind,
        display_order: int | None = None,
        goal: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        actor: str | None = None,
    ) -> Backlog:
        now = utc_now()
        resolved_display_order = (
            display_order
            if display_order is not None
            else await self._repo.next_display_order(project_id)
        )
        initial_status = BacklogStatus.OPEN if kind == BacklogKind.SPRINT else BacklogStatus.ACTIVE
        backlog = Backlog(
            id=new_uuid(),
            project_id=project_id,
            name=name,
            kind=kind,
            status=initial_status,
            display_order=resolved_display_order,
            is_default=False,
            goal=goal,
            start_date=start_date,
            end_date=end_date,
            metadata_json=None,
            created_by=actor,
            updated_by=actor,
            created_at=now,
            updated_at=now,
        )
        return await self._repo.create(backlog)

    async def update_backlog(
        self,
        backlog_id: str,
        data: dict[str, Any],
        *,
        actor: str | None = None,
        allow_status_update: bool = False,
        allow_kind_update: bool = False,
    ) -> Backlog:
        existing = await self._repo.get_by_id(backlog_id)
        if not existing:
            raise NotFoundError(f"Backlog {backlog_id} not found")

        if "status" in data and not allow_status_update:
            raise BusinessRuleError(
                "Backlog status is lifecycle-managed. Use /backlogs/{id}/start "
                "or /backlogs/{id}/complete."
            )

        if "kind" in data and not allow_kind_update:
            raise BusinessRuleError(
                "Backlog kind changes are lifecycle-managed. Use /backlogs/{id}/transition-kind."
            )

        if "is_default" in data and data["is_default"] and not existing.is_default:
            raise BusinessRuleError("Cannot manually set a backlog as default")

        data["updated_by"] = actor
        data["updated_at"] = utc_now()

        updated = await self._repo.update(backlog_id, data)
        if not updated:
            raise NotFoundError(f"Backlog {backlog_id} not found")
        return updated

    async def transition_backlog_kind(
        self,
        backlog_id: str,
        *,
        target_kind: BacklogKind,
        actor: str | None = None,
    ) -> tuple[Backlog, dict[str, Any]]:
        backlog = await self.get_backlog(backlog_id)
        if backlog.kind == target_kind:
            return backlog, {
                "transition": "TRANSITION_BACKLOG_KIND",
                "from_kind": backlog.kind.value,
                "to_kind": target_kind.value,
                "from_status": backlog.status.value,
                "to_status": backlog.status.value,
                "changed": False,
            }

        if backlog.is_default:
            raise BusinessRuleError("Cannot change kind of default backlog")

        if target_kind == BacklogKind.SPRINT and backlog.project_id is None:
            raise BusinessRuleError("Only project-scoped backlogs can transition to SPRINT")

        if backlog.kind == BacklogKind.SPRINT and backlog.status == BacklogStatus.ACTIVE:
            raise BusinessRuleError(
                "Cannot transition kind of an ACTIVE sprint. Complete sprint first."
            )

        target_status = backlog.status
        if target_kind == BacklogKind.SPRINT:
            # Require explicit sprint activation via start endpoint after conversion.
            target_status = BacklogStatus.OPEN

        if (
            target_kind == BacklogKind.BACKLOG
            and target_status == BacklogStatus.ACTIVE
            and backlog.project_id is not None
        ):
            active_product_backlog = await self._repo.get_product_backlog(backlog.project_id)
            if active_product_backlog and active_product_backlog.id != backlog_id:
                raise ConflictError(
                    f"Project {backlog.project_id} already has active product backlog "
                    f"{active_product_backlog.id}"
                )

        data: dict[str, Any] = {"kind": target_kind.value}
        if target_status != backlog.status:
            data["status"] = target_status.value
        updated = await self.update_backlog(
            backlog_id,
            data,
            actor=actor,
            allow_status_update=True,
            allow_kind_update=True,
        )
        return updated, {
            "transition": "TRANSITION_BACKLOG_KIND",
            "from_kind": backlog.kind.value,
            "to_kind": target_kind.value,
            "from_status": backlog.status.value,
            "to_status": updated.status.value,
            "changed": True,
        }

    async def delete_backlog(self, backlog_id: str) -> None:
        existing = await self._repo.get_by_id(backlog_id)
        if not existing:
            raise NotFoundError(f"Backlog {backlog_id} not found")

        if existing.is_default:
            raise BusinessRuleError("Cannot delete the default backlog")

        await self._repo.delete(backlog_id)

    async def add_story_to_backlog(
        self,
        backlog_id: str,
        story_id: str,
        position: int | None,
    ) -> BacklogStoryItem:
        backlog = await self.get_backlog(backlog_id)
        exists, story_project_id = await self._repo.get_story_project_id(story_id)
        if not exists:
            raise NotFoundError(f"Story {story_id} not found")

        self._validate_backlog_scope(
            backlog_project_id=backlog.project_id,
            item_project_id=story_project_id,
            item_label="story",
        )

        existing_backlog_id = await self._repo.story_backlog_id(story_id)
        if existing_backlog_id:
            raise ConflictError(
                f"Story {story_id} already belongs to backlog {existing_backlog_id}"
            )

        return await self._repo.add_story_item(backlog_id, story_id, position)

    async def remove_story_from_backlog(self, backlog_id: str, story_id: str) -> None:
        await self.get_backlog(backlog_id)
        removed = await self._repo.remove_story_item(backlog_id, story_id)
        if not removed:
            raise NotFoundError(f"Story {story_id} is not in backlog {backlog_id}")

    async def add_task_to_backlog(
        self,
        backlog_id: str,
        task_id: str,
        position: int,
    ) -> BacklogTaskItem:
        backlog = await self.get_backlog(backlog_id)
        exists, task_project_id = await self._repo.get_task_project_id(task_id)
        if not exists:
            raise NotFoundError(f"Task {task_id} not found")

        self._validate_backlog_scope(
            backlog_project_id=backlog.project_id,
            item_project_id=task_project_id,
            item_label="task",
        )

        existing_backlog_id = await self._repo.task_backlog_id(task_id)
        if existing_backlog_id:
            raise ConflictError(f"Task {task_id} already belongs to backlog {existing_backlog_id}")

        return await self._repo.add_task_item(backlog_id, task_id, position)

    async def remove_task_from_backlog(self, backlog_id: str, task_id: str) -> None:
        await self.get_backlog(backlog_id)
        removed = await self._repo.remove_task_item(backlog_id, task_id)
        if not removed:
            raise NotFoundError(f"Task {task_id} is not in backlog {backlog_id}")

    async def reorder_backlog_items(
        self,
        backlog_id: str,
        stories: list[dict[str, Any]],
        tasks: list[dict[str, Any]],
    ) -> dict[str, int]:
        await self.get_backlog(backlog_id)
        self._validate_reorder_payload(stories, "story_id")
        self._validate_reorder_payload(tasks, "task_id")

        story_count = await self._repo.get_story_count(backlog_id)
        if len(stories) != story_count:
            raise BusinessRuleError(
                f"Reorder must include all {story_count} stories in the backlog"
            )
        task_count = await self._repo.get_task_count(backlog_id)
        if len(tasks) != task_count:
            raise BusinessRuleError(f"Reorder must include all {task_count} tasks in the backlog")

        for row in stories:
            story_backlog_id = await self._repo.story_backlog_id(row["story_id"])
            if story_backlog_id != backlog_id:
                raise NotFoundError(f"Story {row['story_id']} is not in backlog {backlog_id}")
        for row in tasks:
            task_backlog_id = await self._repo.task_backlog_id(row["task_id"])
            if task_backlog_id != backlog_id:
                raise NotFoundError(f"Task {row['task_id']} is not in backlog {backlog_id}")
        return await self._repo.reorder_items(backlog_id, stories, tasks)

    async def get_backlog_stories(self, backlog_id: str) -> list[dict[str, Any]]:
        await self.get_backlog(backlog_id)
        return await self._repo.list_backlog_stories(backlog_id)

    async def list_backlog_tasks(self, backlog_id: str) -> list[BacklogTaskItem]:
        _ = await self.get_backlog(backlog_id)
        return await self._repo.list_task_items(backlog_id)

    async def get_active_sprint(self, project_id: str) -> ActiveSprintResult:
        backlog, stories = await self._repo.get_active_sprint_with_stories(project_id)
        if not backlog:
            raise NotFoundError(f"No active sprint found for project {project_id}")
        return backlog, stories

    async def start_sprint(
        self, backlog_id: str, *, actor: str | None = None
    ) -> tuple[Backlog, dict[str, Any]]:
        backlog = await self.get_backlog(backlog_id)
        if backlog.kind != BacklogKind.SPRINT:
            raise BusinessRuleError(f"Backlog {backlog_id} is not a sprint")
        if backlog.project_id is None:
            raise BusinessRuleError("Sprint lifecycle transitions require a project-scoped backlog")
        if backlog.status == BacklogStatus.ACTIVE:
            raise BusinessRuleError(f"Sprint {backlog_id} is already ACTIVE")

        active_sprint = await self._repo.get_active_sprint_backlog(backlog.project_id)
        if active_sprint and active_sprint.id != backlog_id:
            raise ConflictError(
                f"Project {backlog.project_id} already has active sprint {active_sprint.id}"
            )

        updated = await self.update_backlog(
            backlog_id,
            {"status": BacklogStatus.ACTIVE.value},
            actor=actor,
            allow_status_update=True,
        )
        meta = await self._build_sprint_transition_meta(
            backlog_id=backlog_id,
            transition="START_SPRINT",
            from_status=backlog.status.value,
            to_status=BacklogStatus.ACTIVE.value,
            active_sprint_id=backlog_id,
        )
        return updated, meta

    async def complete_sprint(
        self, backlog_id: str, *, actor: str | None = None
    ) -> tuple[Backlog, dict[str, Any]]:
        backlog = await self.get_backlog(backlog_id)
        if backlog.kind != BacklogKind.SPRINT:
            raise BusinessRuleError(f"Backlog {backlog_id} is not a sprint")
        if backlog.project_id is None:
            raise BusinessRuleError("Sprint lifecycle transitions require a project-scoped backlog")
        if backlog.status != BacklogStatus.ACTIVE:
            raise BusinessRuleError(f"Sprint {backlog_id} must be ACTIVE to complete")

        sprint_stories = await self._repo.list_backlog_stories(backlog_id)
        unfinished_story_ids = [
            story["id"] for story in sprint_stories if story["status"] != "DONE"
        ]
        if unfinished_story_ids:
            preview = ", ".join(unfinished_story_ids[:5])
            raise BusinessRuleError(
                f"Cannot complete sprint {backlog_id}; "
                f"unfinished stories ({len(unfinished_story_ids)}): {preview}"
            )

        updated = await self.update_backlog(
            backlog_id,
            {"status": BacklogStatus.CLOSED.value},
            actor=actor,
            allow_status_update=True,
        )
        meta = await self._build_sprint_transition_meta(
            backlog_id=backlog_id,
            transition="COMPLETE_SPRINT",
            from_status=backlog.status.value,
            to_status=BacklogStatus.CLOSED.value,
            active_sprint_id=None,
        )
        return updated, meta

    async def move_story_to_active_sprint(
        self,
        *,
        project_id: str,
        story_id: str,
        position: int | None,
    ) -> StoryMembershipMoveResult:
        exists, story_project_id = await self._repo.get_story_project_id(story_id)
        if not exists:
            raise NotFoundError(f"Story {story_id} not found")
        if story_project_id != project_id:
            raise BusinessRuleError(f"Story {story_id} must belong to project {project_id}")

        sprint = await self._repo.get_active_sprint_backlog(project_id)
        if sprint is None:
            raise NotFoundError(f"No active sprint found for project {project_id}")
        product_backlog = await self._repo.get_product_backlog(project_id)
        if product_backlog is None:
            raise NotFoundError(f"No product backlog found for project {project_id}")

        current_backlog_id, current_position = await self._repo.get_story_backlog_item(story_id)
        if current_backlog_id == sprint.id:
            return {
                "story_id": story_id,
                "project_id": project_id,
                "source_backlog_id": sprint.id,
                "target_backlog_id": sprint.id,
                "source_position": current_position,
                "target_position": current_position,
                "moved": False,
            }
        if current_backlog_id != product_backlog.id:
            raise BusinessRuleError(
                f"Story {story_id} must be in product backlog {product_backlog.id} "
                "to join active sprint"
            )

        moved_item = await self._repo.move_story_item(
            source_backlog_id=product_backlog.id,
            target_backlog_id=sprint.id,
            story_id=story_id,
            target_position=position,
        )
        return {
            "story_id": story_id,
            "project_id": project_id,
            "source_backlog_id": product_backlog.id,
            "target_backlog_id": sprint.id,
            "source_position": current_position,
            "target_position": moved_item.position,
            "moved": True,
        }

    async def move_story_to_product_backlog(
        self,
        *,
        project_id: str,
        story_id: str,
        position: int | None,
    ) -> StoryMembershipMoveResult:
        exists, story_project_id = await self._repo.get_story_project_id(story_id)
        if not exists:
            raise NotFoundError(f"Story {story_id} not found")
        if story_project_id != project_id:
            raise BusinessRuleError(f"Story {story_id} must belong to project {project_id}")

        sprint = await self._repo.get_active_sprint_backlog(project_id)
        if sprint is None:
            raise NotFoundError(f"No active sprint found for project {project_id}")
        product_backlog = await self._repo.get_product_backlog(project_id)
        if product_backlog is None:
            raise NotFoundError(f"No product backlog found for project {project_id}")

        current_backlog_id, current_position = await self._repo.get_story_backlog_item(story_id)
        if current_backlog_id == product_backlog.id:
            return {
                "story_id": story_id,
                "project_id": project_id,
                "source_backlog_id": product_backlog.id,
                "target_backlog_id": product_backlog.id,
                "source_position": current_position,
                "target_position": current_position,
                "moved": False,
            }
        if current_backlog_id != sprint.id:
            raise BusinessRuleError(
                f"Story {story_id} must be in active sprint {sprint.id} "
                "to return to product backlog"
            )

        moved_item = await self._repo.move_story_item(
            source_backlog_id=sprint.id,
            target_backlog_id=product_backlog.id,
            story_id=story_id,
            target_position=position,
        )
        return {
            "story_id": story_id,
            "project_id": project_id,
            "source_backlog_id": sprint.id,
            "target_backlog_id": product_backlog.id,
            "source_position": current_position,
            "target_position": moved_item.position,
            "moved": True,
        }

    def _validate_backlog_scope(
        self,
        *,
        backlog_project_id: str | None,
        item_project_id: str | None,
        item_label: str,
    ) -> None:
        if backlog_project_id is None and item_project_id is not None:
            raise BusinessRuleError(f"Global backlog accepts only project-less {item_label}s")
        if backlog_project_id is not None and item_project_id != backlog_project_id:
            raise BusinessRuleError(
                f"{item_label.capitalize()} must belong to project {backlog_project_id}"
            )

    def _validate_reorder_payload(self, payload: list[dict[str, Any]], id_key: str) -> None:
        if not payload:
            return

        ids = [row[id_key] for row in payload]
        if len(ids) != len(set(ids)):
            raise BusinessRuleError(f"Duplicate {id_key} in reorder payload")

        positions = sorted(row["position"] for row in payload)
        expected = list(range(len(payload)))
        if positions != expected:
            raise BusinessRuleError("Positions must be contiguous starting from 0")

    async def _build_sprint_transition_meta(
        self,
        *,
        backlog_id: str,
        transition: str,
        from_status: str,
        to_status: str,
        active_sprint_id: str | None,
    ) -> dict[str, Any]:
        stories = await self._repo.list_backlog_stories(backlog_id)
        story_count = len(stories)
        done_story_count = len([story for story in stories if story["status"] == "DONE"])
        return {
            "transition": transition,
            "from_status": from_status,
            "to_status": to_status,
            "story_count": story_count,
            "done_story_count": done_story_count,
            "unfinished_story_count": story_count - done_story_count,
            "active_sprint_id": active_sprint_id,
        }
