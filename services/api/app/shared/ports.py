from typing import Protocol


class OnAssignmentChanged(Protocol):
    async def __call__(
        self,
        *,
        work_item_id: str,
        work_item_key: str | None,
        work_item_type: str,
        work_item_status: str,
        agent_id: str | None,
        previous_agent_id: str | None,
    ) -> None: ...
