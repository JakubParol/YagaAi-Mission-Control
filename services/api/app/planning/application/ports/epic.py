from abc import ABC, abstractmethod
from typing import Any

from app.planning.domain.models import Epic, EpicOverview


class EpicRepository(ABC):
    @abstractmethod
    async def list_all(
        self,
        *,
        key: str | None = None,
        project_id: str | None = None,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Epic], int]: ...

    @abstractmethod
    async def list_overview(
        self,
        *,
        project_id: str | None = None,
        status: str | None = None,
        owner: str | None = None,
        is_blocked: bool | None = None,
        label: str | None = None,
        text: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-updated_at",
    ) -> tuple[list[EpicOverview], int]: ...

    @abstractmethod
    async def get_by_id(self, epic_id: str) -> Epic | None: ...

    @abstractmethod
    async def get_by_key(self, key: str) -> Epic | None: ...

    @abstractmethod
    async def create(self, epic: Epic) -> Epic: ...

    @abstractmethod
    async def update(self, epic_id: str, data: dict[str, Any]) -> Epic | None: ...

    @abstractmethod
    async def delete(self, epic_id: str) -> bool: ...

    @abstractmethod
    async def get_story_count(self, epic_id: str) -> int: ...

    @abstractmethod
    async def allocate_key(self, project_id: str) -> str: ...

    @abstractmethod
    async def project_exists(self, project_id: str) -> bool: ...
