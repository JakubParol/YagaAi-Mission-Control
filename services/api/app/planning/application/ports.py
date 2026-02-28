from abc import ABC, abstractmethod
from typing import Any

from app.planning.domain.models import (
    Agent,
    Backlog,
    BacklogStoryItem,
    BacklogTaskItem,
    Label,
    Project,
)


class ProjectRepository(ABC):
    @abstractmethod
    async def list_all(
        self,
        *,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Project], int]: ...

    @abstractmethod
    async def get_by_id(self, project_id: str) -> Project | None: ...

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


class AgentRepository(ABC):
    @abstractmethod
    async def list_all(
        self,
        *,
        is_active: bool | None = None,
        source: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Agent], int]: ...

    @abstractmethod
    async def get_by_id(self, agent_id: str) -> Agent | None: ...

    @abstractmethod
    async def create(self, agent: Agent) -> Agent: ...

    @abstractmethod
    async def update(self, agent_id: str, data: dict[str, Any]) -> Agent | None: ...

    @abstractmethod
    async def delete(self, agent_id: str) -> bool: ...


class LabelRepository(ABC):
    @abstractmethod
    async def list_all(
        self,
        *,
        project_id: str | None = None,
        filter_global: bool = False,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[Label], int]: ...

    @abstractmethod
    async def get_by_id(self, label_id: str) -> Label | None: ...

    @abstractmethod
    async def name_exists(self, name: str, project_id: str | None) -> bool: ...

    @abstractmethod
    async def create(self, label: Label) -> Label: ...

    @abstractmethod
    async def delete(self, label_id: str) -> bool: ...


class BacklogRepository(ABC):
    @abstractmethod
    async def list_all(
        self,
        *,
        project_id: str | None = None,
        filter_global: bool = False,
        status: str | None = None,
        kind: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Backlog], int]: ...

    @abstractmethod
    async def get_by_id(self, backlog_id: str) -> Backlog | None: ...

    @abstractmethod
    async def create(self, backlog: Backlog) -> Backlog: ...

    @abstractmethod
    async def update(self, backlog_id: str, data: dict[str, Any]) -> Backlog | None: ...

    @abstractmethod
    async def delete(self, backlog_id: str) -> bool: ...

    @abstractmethod
    async def has_default(self, project_id: str | None) -> bool: ...

    @abstractmethod
    async def get_story_count(self, backlog_id: str) -> int: ...

    @abstractmethod
    async def get_task_count(self, backlog_id: str) -> int: ...

    @abstractmethod
    async def get_story_project_id(self, story_id: str) -> tuple[bool, str | None]: ...

    @abstractmethod
    async def get_task_project_id(self, task_id: str) -> tuple[bool, str | None]: ...

    @abstractmethod
    async def story_backlog_id(self, story_id: str) -> str | None: ...

    @abstractmethod
    async def task_backlog_id(self, task_id: str) -> str | None: ...

    @abstractmethod
    async def add_story_item(
        self, backlog_id: str, story_id: str, position: int
    ) -> BacklogStoryItem: ...

    @abstractmethod
    async def remove_story_item(self, backlog_id: str, story_id: str) -> bool: ...

    @abstractmethod
    async def add_task_item(
        self, backlog_id: str, task_id: str, position: int
    ) -> BacklogTaskItem: ...

    @abstractmethod
    async def remove_task_item(self, backlog_id: str, task_id: str) -> bool: ...

    @abstractmethod
    async def reorder_items(
        self,
        backlog_id: str,
        stories: list[dict[str, Any]],
        tasks: list[dict[str, Any]],
    ) -> dict[str, int]: ...
