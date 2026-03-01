from typing import Any

from app.planning.application.ports import StoryRepository
from app.planning.domain.models import ItemStatus, StatusMode, Story
from app.shared.api.errors import ConflictError, NotFoundError, ValidationError
from app.shared.utils import new_uuid, utc_now


class StoryService:
    def __init__(self, story_repo: StoryRepository) -> None:
        self._story_repo = story_repo

    async def list_stories(
        self,
        *,
        project_id: str | None = None,
        epic_id: str | None = None,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Story], int]:
        return await self._story_repo.list_all(
            project_id=project_id,
            epic_id=epic_id,
            status=status,
            limit=limit,
            offset=offset,
            sort=sort,
        )

    async def get_story(self, story_id: str) -> tuple[Story, int]:
        story = await self._story_repo.get_by_id(story_id)
        if not story:
            raise NotFoundError(f"Story {story_id} not found")
        task_count = await self._story_repo.get_task_count(story_id)
        return story, task_count

    async def create_story(
        self,
        *,
        title: str,
        story_type: str,
        project_id: str | None = None,
        epic_id: str | None = None,
        intent: str | None = None,
        description: str | None = None,
        priority: int | None = None,
        actor: str | None = None,
    ) -> Story:
        key: str | None = None

        if project_id:
            if not await self._story_repo.project_exists(project_id):
                raise ValidationError(f"Project {project_id} does not exist")
            key = await self._story_repo.allocate_key(project_id)

        if epic_id:
            if not await self._story_repo.epic_exists(epic_id):
                raise ValidationError(f"Epic {epic_id} does not exist")

        now = utc_now()
        story = Story(
            id=new_uuid(),
            project_id=project_id,
            epic_id=epic_id,
            key=key,
            title=title,
            intent=intent,
            description=description,
            story_type=story_type,
            status=ItemStatus.TODO,
            status_mode=StatusMode.MANUAL,
            status_override=None,
            status_override_set_at=None,
            is_blocked=False,
            blocked_reason=None,
            priority=priority,
            metadata_json=None,
            created_by=actor,
            updated_by=actor,
            created_at=now,
            updated_at=now,
            started_at=None,
            completed_at=None,
        )
        return await self._story_repo.create(story)

    async def update_story(
        self, story_id: str, data: dict[str, Any], *, actor: str | None = None
    ) -> Story:
        existing = await self._story_repo.get_by_id(story_id)
        if not existing:
            raise NotFoundError(f"Story {story_id} not found")

        if "status" in data:
            new_status = data["status"]
            valid = {s.value for s in ItemStatus}
            if new_status not in valid:
                raise ValidationError(
                    f"Invalid story status '{new_status}'. Allowed: {', '.join(sorted(valid))}"
                )
            data["status"] = new_status
            data["status_override"] = new_status
            data["status_override_set_at"] = utc_now()
            data["status_mode"] = StatusMode.MANUAL

            if new_status == ItemStatus.DONE:
                data["completed_at"] = utc_now()
            elif existing.status == ItemStatus.DONE:
                data["completed_at"] = None

        if "epic_id" in data and data["epic_id"] is not None:
            if not await self._story_repo.epic_exists(data["epic_id"]):
                raise ValidationError(f"Epic {data['epic_id']} does not exist")

        data["updated_by"] = actor
        data["updated_at"] = utc_now()

        updated = await self._story_repo.update(story_id, data)
        if not updated:
            raise NotFoundError(f"Story {story_id} not found")
        return updated

    async def delete_story(self, story_id: str) -> None:
        existing = await self._story_repo.get_by_id(story_id)
        if not existing:
            raise NotFoundError(f"Story {story_id} not found")
        await self._story_repo.delete(story_id)

    async def attach_label(self, story_id: str, label_id: str) -> None:
        if not await self._story_repo.get_by_id(story_id):
            raise NotFoundError(f"Story {story_id} not found")
        if not await self._story_repo.label_exists(label_id):
            raise ValidationError(f"Label {label_id} does not exist")
        if await self._story_repo.label_attached(story_id, label_id):
            raise ConflictError(f"Label {label_id} already attached to story {story_id}")
        await self._story_repo.attach_label(story_id, label_id)

    async def detach_label(self, story_id: str, label_id: str) -> None:
        if not await self._story_repo.get_by_id(story_id):
            raise NotFoundError(f"Story {story_id} not found")
        removed = await self._story_repo.detach_label(story_id, label_id)
        if not removed:
            raise NotFoundError(f"Label {label_id} not attached to story {story_id}")
