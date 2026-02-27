from abc import ABC, abstractmethod

from app.workflow.domain.models import (
    AgentStatus,
    TaskResult,
    WorkflowStory,
    WorkflowTask,
)


class WorkflowAdapterPort(ABC):
    @abstractmethod
    async def list_stories(self) -> list[WorkflowStory]: ...

    @abstractmethod
    async def get_board(self) -> tuple[list[WorkflowStory], list[WorkflowTask]]: ...

    @abstractmethod
    async def get_story(self, story_id: str) -> WorkflowStory | None: ...

    @abstractmethod
    async def list_tasks_for_story(self, story_id: str) -> list[WorkflowTask]: ...

    @abstractmethod
    async def get_task(self, story_id: str, task_id: str) -> WorkflowTask | None: ...

    @abstractmethod
    async def get_task_results(self, story_id: str, task_id: str) -> TaskResult | None: ...

    @abstractmethod
    async def get_agent_statuses(self) -> list[AgentStatus]: ...
