from abc import ABC, abstractmethod
from typing import Any

from app.planning.domain.models import Backlog, BacklogStoryItem, BacklogTaskItem


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
        sort: str | None = None,
    ) -> tuple[list[Backlog], int]: ...

    @abstractmethod
    async def next_display_order(self, project_id: str | None) -> int: ...

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
        self, backlog_id: str, story_id: str, position: int | None
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

    @abstractmethod
    async def list_backlog_stories(self, backlog_id: str) -> list[dict[str, Any]]: ...

    @abstractmethod
    async def list_task_items(self, backlog_id: str) -> list[BacklogTaskItem]: ...

    @abstractmethod
    async def get_active_sprint_with_stories(
        self, project_id: str
    ) -> tuple[Backlog | None, list[dict[str, Any]]]: ...

    @abstractmethod
    async def get_active_sprint_backlog(self, project_id: str) -> Backlog | None: ...

    @abstractmethod
    async def get_product_backlog(self, project_id: str) -> Backlog | None: ...

    @abstractmethod
    async def get_story_backlog_item(self, story_id: str) -> tuple[str | None, int | None]: ...

    @abstractmethod
    async def move_story_item(
        self,
        *,
        source_backlog_id: str,
        target_backlog_id: str,
        story_id: str,
        target_position: int | None,
    ) -> BacklogStoryItem: ...
