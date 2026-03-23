from typing import Any

from sqlalchemy import Result, func, literal, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.control_plane.application.ports import AgentQueueRepository
from app.control_plane.domain.models import AgentQueueEntry, AgentQueueStatus
from app.control_plane.infrastructure.shared.mappers import queue_entry_from_row
from app.control_plane.infrastructure.tables import control_plane_agent_queue

_t = control_plane_agent_queue

_CANCELLABLE_STATUSES = (
    AgentQueueStatus.QUEUED.value,
    AgentQueueStatus.DISPATCHING.value,
    AgentQueueStatus.ACK_PENDING.value,
)

# Statuses that mean the agent is actively working (capacity occupied)
_ACTIVE_RUNTIME_STATUSES = (
    AgentQueueStatus.DISPATCHING.value,
    AgentQueueStatus.ACK_PENDING.value,
    AgentQueueStatus.PLANNING.value,
    AgentQueueStatus.EXECUTING.value,
    AgentQueueStatus.BLOCKED.value,
    AgentQueueStatus.REVIEW_READY.value,
)


def _affected_rows(result: Result[Any]) -> int:
    return getattr(result, "rowcount", 0)


class DbAgentQueueRepository(AgentQueueRepository):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def enqueue(self, *, entry: AgentQueueEntry) -> None:
        next_pos = (
            select(func.coalesce(func.max(_t.c.queue_position), 0) + 1)
            .where(
                _t.c.agent_id == entry.agent_id,
                _t.c.status == AgentQueueStatus.QUEUED.value,
            )
            .scalar_subquery()
        )
        await self._db.execute(
            _t.insert().from_select(
                [
                    "id",
                    "work_item_id",
                    "work_item_key",
                    "work_item_type",
                    "agent_id",
                    "status",
                    "queue_position",
                    "correlation_id",
                    "causation_id",
                    "enqueued_at",
                    "updated_at",
                ],
                select(
                    literal(entry.id),
                    literal(entry.work_item_id),
                    literal(entry.work_item_key),
                    literal(entry.work_item_type),
                    literal(entry.agent_id),
                    literal(entry.status.value),
                    next_pos,
                    literal(entry.correlation_id),
                    literal(entry.causation_id),
                    literal(entry.enqueued_at),
                    literal(entry.updated_at),
                ),
            )
        )
        await self._db.flush()

    async def get_active_by_work_item(self, *, work_item_id: str) -> AgentQueueEntry | None:
        result = await self._db.execute(
            select(_t).where(
                _t.c.work_item_id == work_item_id,
                _t.c.status.in_(_CANCELLABLE_STATUSES),
            )
        )
        row = result.first()
        return queue_entry_from_row(row) if row else None

    async def cancel_by_work_item(
        self,
        *,
        work_item_id: str,
        cancelled_at: str,
    ) -> bool:
        result = await self._db.execute(
            update(_t)
            .where(
                _t.c.work_item_id == work_item_id,
                _t.c.status.in_(_CANCELLABLE_STATUSES),
            )
            .values(
                status=AgentQueueStatus.CANCELLED.value,
                cancelled_at=cancelled_at,
                updated_at=cancelled_at,
            )
        )
        await self._db.flush()
        return _affected_rows(result) > 0

    async def next_queue_position(self, *, agent_id: str) -> int:
        result = await self._db.execute(
            select(func.coalesce(func.max(_t.c.queue_position), 0)).where(
                _t.c.agent_id == agent_id,
                _t.c.status == AgentQueueStatus.QUEUED.value,
            )
        )
        current_max = result.scalar_one()
        return current_max + 1

    async def list_queued_by_agent(
        self,
        *,
        agent_id: str,
        status: AgentQueueStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[AgentQueueEntry], int]:
        base = select(_t).where(_t.c.agent_id == agent_id)
        count_base = select(func.count()).select_from(_t).where(_t.c.agent_id == agent_id)
        if status is not None:
            base = base.where(_t.c.status == status.value)
            count_base = count_base.where(_t.c.status == status.value)

        total_result = await self._db.execute(count_base)
        total = total_result.scalar_one()

        rows_result = await self._db.execute(
            base.order_by(_t.c.queue_position.asc()).limit(limit).offset(offset)
        )
        entries = [queue_entry_from_row(row) for row in rows_result]
        return entries, total

    async def get_oldest_queued_for_agent(
        self,
        *,
        agent_id: str,
    ) -> AgentQueueEntry | None:
        result = await self._db.execute(
            select(_t)
            .where(
                _t.c.agent_id == agent_id,
                _t.c.status == AgentQueueStatus.QUEUED.value,
            )
            .order_by(_t.c.queue_position.asc())
            .limit(1)
        )
        row = result.first()
        return queue_entry_from_row(row) if row else None

    async def has_active_item(self, *, agent_id: str) -> bool:
        result = await self._db.execute(
            select(func.count())
            .select_from(_t)
            .where(
                _t.c.agent_id == agent_id,
                _t.c.status.in_(_ACTIVE_RUNTIME_STATUSES),
            )
        )
        return (result.scalar_one() or 0) > 0

    async def get_active_entry_for_agent(
        self,
        *,
        agent_id: str,
    ) -> AgentQueueEntry | None:
        result = await self._db.execute(
            select(_t)
            .where(
                _t.c.agent_id == agent_id,
                _t.c.status.in_(_ACTIVE_RUNTIME_STATUSES),
            )
            .limit(1)
        )
        row = result.first()
        return queue_entry_from_row(row) if row else None

    async def transition_status(
        self,
        *,
        entry_id: str,
        expected_status: AgentQueueStatus,
        new_status: AgentQueueStatus,
        updated_at: str,
    ) -> bool:
        result = await self._db.execute(
            update(_t)
            .where(
                _t.c.id == entry_id,
                _t.c.status == expected_status.value,
            )
            .values(
                status=new_status.value,
                updated_at=updated_at,
            )
        )
        await self._db.flush()
        return _affected_rows(result) > 0

    async def commit(self) -> None:
        await self._db.commit()
