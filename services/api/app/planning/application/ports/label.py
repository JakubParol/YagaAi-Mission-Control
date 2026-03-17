from abc import ABC, abstractmethod
from typing import Any

from app.planning.domain.models import Label


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
    async def update(self, label_id: str, data: dict[str, Any]) -> Label | None: ...

    @abstractmethod
    async def delete(self, label_id: str) -> bool: ...
