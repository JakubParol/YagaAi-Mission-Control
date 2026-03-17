from abc import ABC, abstractmethod
from typing import Any

from app.planning.domain.models import Task, TaskAssignment


class TaskRepository(ABC):
    @abstractmethod
    async def list_all(
        self,
        *,
        key: str | None = None,
        project_id: str | None = None,
        story_id: str | None = None,
        epic_id: str | None = None,
        status: str | None = None,
        assignee_id: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Task], int]: ...

    @abstractmethod
    async def get_by_id(self, task_id: str) -> Task | None: ...

    @abstractmethod
    async def get_by_key(self, key: str) -> Task | None: ...

    @abstractmethod
    async def create(self, task: Task) -> Task: ...

    @abstractmethod
    async def update(self, task_id: str, data: dict[str, Any]) -> Task | None: ...

    @abstractmethod
    async def update_assignee_with_event(
        self,
        *,
        task_id: str,
        data: dict[str, Any],
        new_assignee_agent_id: str | None,
        previous_assignee_agent_id: str | None,
        actor_id: str | None,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> Task | None: ...

    @abstractmethod
    async def delete(self, task_id: str) -> bool: ...

    @abstractmethod
    async def allocate_key(self, project_id: str) -> str: ...

    @abstractmethod
    async def project_exists(self, project_id: str) -> bool: ...

    @abstractmethod
    async def story_exists(self, story_id: str) -> bool: ...

    @abstractmethod
    async def agent_exists(self, agent_id: str) -> bool: ...

    @abstractmethod
    async def label_exists(self, label_id: str) -> bool: ...

    @abstractmethod
    async def label_attached(self, task_id: str, label_id: str) -> bool: ...

    @abstractmethod
    async def attach_label(self, task_id: str, label_id: str) -> None: ...

    @abstractmethod
    async def detach_label(self, task_id: str, label_id: str) -> bool: ...

    @abstractmethod
    async def get_active_assignment(self, task_id: str) -> TaskAssignment | None: ...

    @abstractmethod
    async def get_assignments(self, task_id: str) -> list[TaskAssignment]: ...

    @abstractmethod
    async def create_assignment(self, assignment: TaskAssignment) -> TaskAssignment: ...

    @abstractmethod
    async def close_assignment(self, task_id: str, unassigned_at: str) -> bool: ...

    @abstractmethod
    async def assign_agent_with_event(
        self,
        *,
        task_id: str,
        agent_id: str,
        previous_assignee_agent_id: str | None,
        assigned_by: str | None,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> TaskAssignment: ...

    @abstractmethod
    async def unassign_agent_with_event(
        self,
        *,
        task_id: str,
        previous_assignee_agent_id: str,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> bool: ...

    @abstractmethod
    async def get_story_project_id(self, story_id: str) -> tuple[bool, str | None]: ...

    @abstractmethod
    async def get_story_task_progress(self, story_id: str) -> tuple[int, int]: ...
