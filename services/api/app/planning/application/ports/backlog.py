from abc import ABC, abstractmethod
from typing import Any

from app.planning.domain.models import Backlog, BacklogItem


class BacklogRepository(ABC):
    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

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
    async def get_by_id(self, backlog_id: str) -> Backlog | None: ...

    @abstractmethod
    async def create(self, backlog: Backlog) -> Backlog: ...

    @abstractmethod
    async def update(
        self, backlog_id: str, data: dict[str, Any]
    ) -> Backlog | None: ...

    @abstractmethod
    async def delete(self, backlog_id: str) -> bool: ...

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    @abstractmethod
    async def has_default(self, project_id: str | None) -> bool: ...

    @abstractmethod
    async def next_rank(self, project_id: str | None) -> str: ...

    @abstractmethod
    async def get_item_count(self, backlog_id: str) -> int: ...

    # ------------------------------------------------------------------
    # Item membership (unified — replaces story/task methods)
    # ------------------------------------------------------------------

    @abstractmethod
    async def work_item_backlog_id(self, work_item_id: str) -> str | None: ...

    @abstractmethod
    async def get_work_item_project_id(
        self, work_item_id: str
    ) -> tuple[bool, str | None]: ...

    @abstractmethod
    async def add_item(
        self, backlog_id: str, work_item_id: str, rank: str
    ) -> BacklogItem: ...

    @abstractmethod
    async def remove_item(
        self, backlog_id: str, work_item_id: str
    ) -> bool: ...

    @abstractmethod
    async def list_items(
        self, backlog_id: str
    ) -> list[dict[str, Any]]: ...

    @abstractmethod
    async def update_item_rank(
        self, backlog_id: str, work_item_id: str, rank: str
    ) -> bool: ...

    # ------------------------------------------------------------------
    # Sprint helpers
    # ------------------------------------------------------------------

    @abstractmethod
    async def get_active_sprint_with_items(
        self, project_id: str
    ) -> tuple[Backlog | None, list[dict[str, Any]]]: ...

    @abstractmethod
    async def get_active_sprint_backlog(
        self, project_id: str
    ) -> Backlog | None: ...

    @abstractmethod
    async def get_product_backlog(
        self, project_id: str
    ) -> Backlog | None: ...

    # ------------------------------------------------------------------
    # Item movement
    # ------------------------------------------------------------------

    @abstractmethod
    async def get_item_backlog_info(
        self, work_item_id: str
    ) -> tuple[str | None, str | None]: ...

    @abstractmethod
    async def move_item(
        self,
        *,
        source_backlog_id: str,
        target_backlog_id: str,
        work_item_id: str,
        rank: str,
    ) -> BacklogItem: ...

    @abstractmethod
    async def move_non_done_items(
        self,
        *,
        source_backlog_id: str,
        target_backlog_id: str,
    ) -> int: ...
