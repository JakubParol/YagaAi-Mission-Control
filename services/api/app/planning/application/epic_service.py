from typing import Any

from app.planning.application.ports import EpicRepository
from app.planning.domain.models import Epic, EpicStatus, StatusMode
from app.shared.api.errors import NotFoundError, ValidationError
from app.shared.utils import new_uuid, utc_now


class EpicService:
    def __init__(self, epic_repo: EpicRepository) -> None:
        self._epic_repo = epic_repo

    async def list_epics(
        self,
        *,
        key: str | None = None,
        project_id: str | None = None,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Epic], int]:
        return await self._epic_repo.list_all(
            key=key, project_id=project_id, status=status, limit=limit, offset=offset, sort=sort
        )

    async def get_epic(self, epic_id: str) -> tuple[Epic, int]:
        epic = await self._epic_repo.get_by_id(epic_id)
        if not epic:
            raise NotFoundError(f"Epic {epic_id} not found")
        story_count = await self._epic_repo.get_story_count(epic_id)
        return epic, story_count

    async def get_epic_by_key(self, key: str) -> tuple[Epic, int]:
        epic = await self._epic_repo.get_by_key(key)
        if not epic:
            raise NotFoundError(f"Epic with key '{key}' not found")
        story_count = await self._epic_repo.get_story_count(epic.id)
        return epic, story_count

    async def create_epic(
        self,
        *,
        project_id: str,
        title: str,
        description: str | None = None,
        priority: int | None = None,
        actor: str | None = None,
    ) -> Epic:
        if not await self._epic_repo.project_exists(project_id):
            raise ValidationError(f"Project {project_id} does not exist")

        key = await self._epic_repo.allocate_key(project_id)
        now = utc_now()
        epic = Epic(
            id=new_uuid(),
            project_id=project_id,
            key=key,
            title=title,
            description=description,
            status=EpicStatus.TODO,
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
        )
        return await self._epic_repo.create(epic)

    async def update_epic(
        self, epic_id: str, data: dict[str, Any], *, actor: str | None = None
    ) -> Epic:
        existing = await self._epic_repo.get_by_id(epic_id)
        if not existing:
            raise NotFoundError(f"Epic {epic_id} not found")

        if "status" in data:
            new_status = data["status"]
            valid = {s.value for s in EpicStatus}
            if new_status not in valid:
                raise ValidationError(
                    f"Invalid epic status '{new_status}'. Allowed: {', '.join(sorted(valid))}"
                )
            # Manual status override: set the override fields and explicitly
            # write the resolved status value. Switch status_mode to MANUAL so
            # derived-status logic knows this was a human/API override.
            data["status"] = new_status
            data["status_override"] = new_status
            data["status_override_set_at"] = utc_now()
            data["status_mode"] = StatusMode.MANUAL

        data["updated_by"] = actor
        data["updated_at"] = utc_now()

        updated = await self._epic_repo.update(epic_id, data)
        if not updated:
            raise NotFoundError(f"Epic {epic_id} not found")
        return updated

    async def delete_epic(self, epic_id: str) -> None:
        existing = await self._epic_repo.get_by_id(epic_id)
        if not existing:
            raise NotFoundError(f"Epic {epic_id} not found")
        await self._epic_repo.delete(epic_id)
