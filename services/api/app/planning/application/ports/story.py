from abc import ABC, abstractmethod
from typing import Any

from app.planning.domain.models import Story


class StoryRepository(ABC):
    @abstractmethod
    async def list_all(
        self,
        *,
        key: str | None = None,
        project_id: str | None = None,
        epic_id: str | None = None,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Story], int]: ...

    @abstractmethod
    async def get_by_id(self, story_id: str) -> Story | None: ...

    @abstractmethod
    async def get_by_key(self, key: str) -> Story | None: ...

    @abstractmethod
    async def create(self, story: Story) -> Story: ...

    @abstractmethod
    async def update(self, story_id: str, data: dict[str, Any]) -> Story | None: ...

    @abstractmethod
    async def update_assignee_with_event(
        self,
        *,
        story_id: str,
        data: dict[str, Any],
        new_assignee_agent_id: str | None,
        previous_assignee_agent_id: str | None,
        actor_id: str | None,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> Story | None: ...

    @abstractmethod
    async def delete(self, story_id: str) -> bool: ...

    @abstractmethod
    async def get_task_count(self, story_id: str) -> int: ...

    @abstractmethod
    async def allocate_key(self, project_id: str) -> str: ...

    @abstractmethod
    async def project_exists(self, project_id: str) -> bool: ...

    @abstractmethod
    async def epic_exists(self, epic_id: str) -> bool: ...

    @abstractmethod
    async def agent_exists(self, agent_id: str) -> bool: ...

    @abstractmethod
    async def label_exists(self, label_id: str) -> bool: ...

    @abstractmethod
    async def attach_label(self, story_id: str, label_id: str) -> None: ...

    @abstractmethod
    async def detach_label(self, story_id: str, label_id: str) -> bool: ...

    @abstractmethod
    async def label_attached(self, story_id: str, label_id: str) -> bool: ...
