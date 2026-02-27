from datetime import datetime, timezone
from uuid import uuid4

from app.planning.application.ports import LabelRepository
from app.planning.domain.models import Label
from app.shared.api.errors import ConflictError, NotFoundError


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class LabelService:
    def __init__(self, repo: LabelRepository) -> None:
        self._repo = repo

    async def list_labels(
        self,
        *,
        project_id: str | None = None,
        filter_global: bool = False,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[Label], int]:
        return await self._repo.list(
            project_id=project_id, filter_global=filter_global, limit=limit, offset=offset
        )

    async def get_label(self, label_id: str) -> Label:
        label = await self._repo.get_by_id(label_id)
        if not label:
            raise NotFoundError(f"Label {label_id} not found")
        return label

    async def create_label(
        self,
        *,
        name: str,
        project_id: str | None = None,
        color: str | None = None,
    ) -> Label:
        if await self._repo.name_exists(name, project_id):
            scope = f"project {project_id}" if project_id else "global scope"
            raise ConflictError(f"Label '{name}' already exists in {scope}")

        label = Label(
            id=str(uuid4()),
            project_id=project_id,
            name=name,
            color=color,
            created_at=_now(),
        )
        return await self._repo.create(label)

    async def delete_label(self, label_id: str) -> None:
        existing = await self._repo.get_by_id(label_id)
        if not existing:
            raise NotFoundError(f"Label {label_id} not found")
        await self._repo.delete(label_id)
