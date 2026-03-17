from abc import ABC, abstractmethod
from typing import Any

from app.planning.domain.models import WorkItem, WorkItemAssignment, WorkItemOverview


class WorkItemRepository(ABC):
    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    @abstractmethod
    async def list_all(
        self,
        *,
        type: str | None = None,
        project_id: str | None = None,
        parent_id: str | None = None,
        status: str | None = None,
        assignee_id: str | None = None,
        key: str | None = None,
        sub_type: str | None = None,
        is_blocked: bool | None = None,
        text_search: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[WorkItem], int]: ...

    @abstractmethod
    async def get_by_id(self, work_item_id: str) -> WorkItem | None: ...

    @abstractmethod
    async def get_by_key(self, key: str) -> WorkItem | None: ...

    @abstractmethod
    async def create(self, work_item: WorkItem) -> WorkItem: ...

    @abstractmethod
    async def update(
        self, work_item_id: str, data: dict[str, Any]
    ) -> WorkItem | None: ...

    @abstractmethod
    async def delete(self, work_item_id: str) -> bool: ...

    # ------------------------------------------------------------------
    # Hierarchy
    # ------------------------------------------------------------------

    @abstractmethod
    async def list_children(
        self,
        parent_id: str,
        *,
        type: str | None = None,
        status: str | None = None,
        limit: int = 100,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[WorkItem], int]: ...

    @abstractmethod
    async def get_children_count(self, work_item_id: str) -> int: ...

    @abstractmethod
    async def get_children_progress(
        self, parent_id: str
    ) -> tuple[int, int]: ...

    # ------------------------------------------------------------------
    # Overview / aggregates
    # ------------------------------------------------------------------

    @abstractmethod
    async def list_overview(
        self,
        *,
        type: str | None = None,
        project_id: str | None = None,
        status: str | None = None,
        assignee_id: str | None = None,
        is_blocked: bool | None = None,
        label: str | None = None,
        text_search: str | None = None,
        limit: int = 50,
        offset: int = 0,
        sort: str = "-updated_at",
    ) -> tuple[list[WorkItemOverview], int]: ...

    # ------------------------------------------------------------------
    # Key allocation
    # ------------------------------------------------------------------

    @abstractmethod
    async def allocate_key(self, project_id: str) -> str: ...

    # ------------------------------------------------------------------
    # Existence checks
    # ------------------------------------------------------------------

    @abstractmethod
    async def project_exists(self, project_id: str) -> bool: ...

    @abstractmethod
    async def agent_exists(self, agent_id: str) -> bool: ...

    @abstractmethod
    async def label_exists(self, label_id: str) -> bool: ...

    @abstractmethod
    async def parent_exists(self, parent_id: str) -> WorkItem | None: ...

    # ------------------------------------------------------------------
    # Labels
    # ------------------------------------------------------------------

    @abstractmethod
    async def label_attached(
        self, work_item_id: str, label_id: str
    ) -> bool: ...

    @abstractmethod
    async def attach_label(
        self, work_item_id: str, label_id: str
    ) -> None: ...

    @abstractmethod
    async def detach_label(
        self, work_item_id: str, label_id: str
    ) -> bool: ...

    # ------------------------------------------------------------------
    # Assignments
    # ------------------------------------------------------------------

    @abstractmethod
    async def get_active_assignment(
        self, work_item_id: str
    ) -> WorkItemAssignment | None: ...

    @abstractmethod
    async def get_assignments(
        self, work_item_id: str
    ) -> list[WorkItemAssignment]: ...

    @abstractmethod
    async def create_assignment(
        self, assignment: WorkItemAssignment
    ) -> WorkItemAssignment: ...

    @abstractmethod
    async def close_assignment(
        self, work_item_id: str, unassigned_at: str
    ) -> bool: ...

    @abstractmethod
    async def assign_agent_with_event(
        self,
        *,
        work_item_id: str,
        agent_id: str,
        previous_assignee_agent_id: str | None,
        assigned_by: str | None,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> WorkItemAssignment: ...

    @abstractmethod
    async def unassign_agent_with_event(
        self,
        *,
        work_item_id: str,
        previous_assignee_agent_id: str,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> bool: ...

    @abstractmethod
    async def update_assignee_with_event(
        self,
        *,
        work_item_id: str,
        data: dict[str, Any],
        new_assignee_agent_id: str | None,
        previous_assignee_agent_id: str | None,
        actor_id: str | None,
        occurred_at: str,
        correlation_id: str,
        causation_id: str,
    ) -> WorkItem | None: ...

    # ------------------------------------------------------------------
    # Derived status helpers
    # ------------------------------------------------------------------

    @abstractmethod
    async def get_parent_id(self, work_item_id: str) -> str | None: ...

    @abstractmethod
    async def recompute_derived_status(self, parent_id: str) -> None: ...
