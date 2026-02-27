from abc import ABC, abstractmethod

from app.observability.domain.models import (
    AgentStatus,
    DailyMetric,
    ImportRecord,
    LangfuseRequest,
    PaginatedRequests,
    SupervisorStory,
    SupervisorTask,
    TaskResult,
)


class LangfuseRepositoryPort(ABC):
    @abstractmethod
    async def get_last_successful_import(self) -> ImportRecord | None: ...

    @abstractmethod
    async def create_import_run(
        self, mode: str, from_timestamp: str | None, to_timestamp: str
    ) -> ImportRecord: ...

    @abstractmethod
    async def complete_import_run(
        self, import_id: int, status: str, error_message: str | None = None
    ) -> None: ...

    @abstractmethod
    async def get_latest_import(self) -> ImportRecord | None: ...

    @abstractmethod
    async def get_counts(self) -> dict[str, int]: ...

    @abstractmethod
    async def upsert_daily_metrics(self, metrics: list[DailyMetric]) -> None: ...

    @abstractmethod
    async def get_daily_metrics(self, from_date: str, to_date: str) -> list[DailyMetric]: ...

    @abstractmethod
    async def get_metrics_by_time_range(self, from_ts: str, to_ts: str) -> list[DailyMetric]: ...

    @abstractmethod
    async def get_distinct_models(self) -> list[str]: ...

    @abstractmethod
    async def upsert_requests(self, requests: list[LangfuseRequest]) -> None: ...

    @abstractmethod
    async def get_requests(
        self,
        page: int,
        limit: int,
        model: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> PaginatedRequests: ...


class LangfuseClientPort(ABC):
    @abstractmethod
    async def fetch_daily_metrics(self, from_date: str, to_date: str) -> list[dict]: ...

    @abstractmethod
    async def fetch_all_observations(self, from_timestamp: str | None = None) -> list[dict]: ...


class SupervisorAdapterPort(ABC):
    @abstractmethod
    async def list_stories(self) -> list[SupervisorStory]: ...

    @abstractmethod
    async def get_board(self) -> tuple[list[SupervisorStory], list[SupervisorTask]]: ...

    @abstractmethod
    async def get_story(self, story_id: str) -> SupervisorStory | None: ...

    @abstractmethod
    async def list_tasks_for_story(self, story_id: str) -> list[SupervisorTask]: ...

    @abstractmethod
    async def get_task(self, story_id: str, task_id: str) -> SupervisorTask | None: ...

    @abstractmethod
    async def get_task_results(self, story_id: str, task_id: str) -> TaskResult | None: ...

    @abstractmethod
    async def get_agent_statuses(self) -> list[AgentStatus]: ...
