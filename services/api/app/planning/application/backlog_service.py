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
        sort: str = "-created_at",
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
        goal: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        actor: str | None = None,
    ) -> Backlog:
        now = utc_now()
        backlog = Backlog(
            id=new_uuid(),
            project_id=project_id,
            name=name,
            kind=kind,
            status=BacklogStatus.ACTIVE,
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
        self, backlog_id: str, data: dict[str, Any], *, actor: str | None = None
    ) -> Backlog:
        existing = await self._repo.get_by_id(backlog_id)
        if not existing:
            raise NotFoundError(f"Backlog {backlog_id} not found")

        if "is_default" in data and data["is_default"] and not existing.is_default:
            raise BusinessRuleError("Cannot manually set a backlog as default")

        data["updated_by"] = actor
        data["updated_at"] = utc_now()

        updated = await self._repo.update(backlog_id, data)
        if not updated:
            raise NotFoundError(f"Backlog {backlog_id} not found")
        return updated

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
        position: int,
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

    async def get_active_sprint(self, project_id: str) -> ActiveSprintResult:
        backlog, stories = await self._repo.get_active_sprint_with_stories(project_id)
        if not backlog:
            raise NotFoundError(f"No active sprint found for project {project_id}")
        return backlog, stories

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
