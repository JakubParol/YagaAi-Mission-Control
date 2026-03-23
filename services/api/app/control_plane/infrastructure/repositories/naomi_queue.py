from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.control_plane.application.ports import NaomiQueueRepository
from app.control_plane.domain.models import NaomiQueueEntry, NaomiQueueStatus
from app.control_plane.infrastructure.shared.mappers import queue_entry_from_row
from app.control_plane.infrastructure.tables import control_plane_naomi_queue

_t = control_plane_naomi_queue


class DbNaomiQueueRepository(NaomiQueueRepository):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def enqueue(self, *, entry: NaomiQueueEntry) -> None:
        await self._db.execute(
            _t.insert().values(
                id=entry.id,
                work_item_id=entry.work_item_id,
                work_item_key=entry.work_item_key,
                work_item_type=entry.work_item_type,
                agent_id=entry.agent_id,
                status=entry.status.value,
                queue_position=entry.queue_position,
                correlation_id=entry.correlation_id,
                causation_id=entry.causation_id,
                enqueued_at=entry.enqueued_at,
                updated_at=entry.updated_at,
            )
        )

    async def get_active_by_work_item(
        self, *, work_item_id: str
    ) -> NaomiQueueEntry | None:
        result = await self._db.execute(
            select(_t).where(
                _t.c.work_item_id == work_item_id,
                _t.c.status == NaomiQueueStatus.QUEUED.value,
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
                _t.c.status == NaomiQueueStatus.QUEUED.value,
            )
            .values(
                status=NaomiQueueStatus.CANCELLED.value,
                cancelled_at=cancelled_at,
                updated_at=cancelled_at,
            )
        )
        return result.rowcount > 0

    async def next_queue_position(self, *, agent_id: str) -> int:
        result = await self._db.execute(
            select(func.coalesce(func.max(_t.c.queue_position), 0)).where(
                _t.c.agent_id == agent_id,
                _t.c.status == NaomiQueueStatus.QUEUED.value,
            )
        )
        current_max = result.scalar_one()
        return current_max + 1

    async def list_queued_by_agent(
        self,
        *,
        agent_id: str,
        status: NaomiQueueStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[NaomiQueueEntry], int]:
        base = select(_t).where(_t.c.agent_id == agent_id)
        count_base = select(func.count()).select_from(_t).where(
            _t.c.agent_id == agent_id
        )
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
