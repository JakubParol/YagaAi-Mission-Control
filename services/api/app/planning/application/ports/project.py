from abc import ABC, abstractmethod
from typing import Any

from app.planning.domain.models import Project


class ProjectRepository(ABC):
    @abstractmethod
    async def list_all(
        self,
        *,
        key: str | None = None,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Project], int]: ...

    @abstractmethod
    async def get_by_id(self, project_id: str) -> Project | None: ...

    @abstractmethod
    async def get_by_key(self, key: str) -> Project | None: ...

    @abstractmethod
    async def key_exists(self, key: str) -> bool: ...

    @abstractmethod
    async def create(self, project: Project) -> Project: ...

    @abstractmethod
    async def update(self, project_id: str, data: dict[str, Any]) -> Project | None: ...

    @abstractmethod
    async def delete(self, project_id: str) -> bool: ...

    @abstractmethod
    async def create_project_counter(self, project_id: str) -> None: ...
