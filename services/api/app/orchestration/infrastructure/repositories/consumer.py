from sqlalchemy import and_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.orchestration.application.ports import ConsumerRepository
from app.orchestration.infrastructure.tables import (
    orchestration_consumer_offsets,
    orchestration_processed_messages,
)

_co = orchestration_consumer_offsets.c
_pm = orchestration_processed_messages.c


class DbConsumerRepository(ConsumerRepository):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_consumer_offset(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        consumer_name: str,
    ) -> str | None:
        result = await self._db.execute(
            select(_co.last_message_id)
            .where(
                and_(
                    _co.stream_key == stream_key,
                    _co.consumer_group == consumer_group,
                    _co.consumer_name == consumer_name,
                )
            )
            .limit(1)
        )
        row = result.first()
        return str(row.last_message_id) if row else None

    async def upsert_consumer_offset(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        consumer_name: str,
        last_message_id: str,
        updated_at: str,
    ) -> None:
        stmt = pg_insert(orchestration_consumer_offsets).values(
            stream_key=stream_key,
            consumer_group=consumer_group,
            consumer_name=consumer_name,
            last_message_id=last_message_id,
            updated_at=updated_at,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[_co.stream_key, _co.consumer_group, _co.consumer_name],
            set_={
                "last_message_id": stmt.excluded.last_message_id,
                "updated_at": stmt.excluded.updated_at,
            },
        )
        await self._db.execute(stmt)
        await self._db.commit()

    async def is_message_processed(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        message_id: str,
    ) -> bool:
        result = await self._db.execute(
            select(_pm.message_id)
            .where(
                and_(
                    _pm.stream_key == stream_key,
                    _pm.consumer_group == consumer_group,
                    _pm.message_id == message_id,
                )
            )
            .limit(1)
        )
        return result.first() is not None

    async def mark_message_processed(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        message_id: str,
        correlation_id: str,
        processed_at: str,
    ) -> None:
        stmt = pg_insert(orchestration_processed_messages).values(
            stream_key=stream_key,
            consumer_group=consumer_group,
            message_id=message_id,
            correlation_id=correlation_id,
            processed_at=processed_at,
        )
        stmt = stmt.on_conflict_do_nothing()
        await self._db.execute(stmt)
        await self._db.commit()

    async def mark_message_processed_and_checkpoint(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        consumer_name: str,
        message_id: str,
        correlation_id: str,
        processed_at: str,
    ) -> None:
        msg_stmt = pg_insert(orchestration_processed_messages).values(
            stream_key=stream_key,
            consumer_group=consumer_group,
            message_id=message_id,
            correlation_id=correlation_id,
            processed_at=processed_at,
        )
        msg_stmt = msg_stmt.on_conflict_do_nothing()
        await self._db.execute(msg_stmt)

        offset_stmt = pg_insert(orchestration_consumer_offsets).values(
            stream_key=stream_key,
            consumer_group=consumer_group,
            consumer_name=consumer_name,
            last_message_id=message_id,
            updated_at=processed_at,
        )
        offset_stmt = offset_stmt.on_conflict_do_update(
            index_elements=[_co.stream_key, _co.consumer_group, _co.consumer_name],
            set_={
                "last_message_id": offset_stmt.excluded.last_message_id,
                "updated_at": offset_stmt.excluded.updated_at,
            },
        )
        await self._db.execute(offset_stmt)
        await self._db.commit()
