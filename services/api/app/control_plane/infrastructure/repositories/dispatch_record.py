import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.control_plane.application.ports import DispatchRecordRepository
from app.control_plane.domain.models import DispatchRecord
from app.control_plane.infrastructure.shared.mappers import dispatch_record_from_row
from app.control_plane.infrastructure.tables import control_plane_dispatch_records

_t = control_plane_dispatch_records


class DbDispatchRecordRepository(DispatchRecordRepository):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create(self, *, record: DispatchRecord) -> None:
        await self._db.execute(
            _t.insert().values(
                id=record.id,
                queue_entry_id=record.queue_entry_id,
                run_id=record.run_id,
                agent_id=record.agent_id,
                work_item_id=record.work_item_id,
                work_item_key=record.work_item_key,
                status=record.status.value,
                envelope_json=json.dumps(record.envelope_json),
                dispatch_session_key=record.dispatch_session_key,
                process_id=record.process_id,
                error_message=record.error_message,
                dispatched_at=record.dispatched_at,
                created_at=record.created_at,
            )
        )
        await self._db.flush()

    async def get_by_queue_entry_id(
        self,
        *,
        queue_entry_id: str,
    ) -> DispatchRecord | None:
        result = await self._db.execute(
            select(_t)
            .where(_t.c.queue_entry_id == queue_entry_id)
            .order_by(_t.c.created_at.desc())
            .limit(1)
        )
        row = result.first()
        if row is None:
            return None

        envelope = json.loads(row.envelope_json) if row.envelope_json else {}
        return dispatch_record_from_row(row, envelope)

    async def commit(self) -> None:
        await self._db.commit()
