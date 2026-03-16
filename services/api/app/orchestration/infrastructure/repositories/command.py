import json

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.orchestration.application.ports import CommandRepository
from app.orchestration.domain.models import (
    CommandEnvelope,
    OutboxEventEnvelope,
    OutboxStatus,
)
from app.orchestration.infrastructure.shared.mappers import outbox_event_from_row
from app.orchestration.infrastructure.tables import (
    orchestration_commands,
    orchestration_outbox,
)

_c = orchestration_commands.c
_o = orchestration_outbox.c


def _json_compact(data: object) -> str:
    return json.dumps(data, separators=(",", ":"), sort_keys=True)


class DbCommandRepository(CommandRepository):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create_command_with_outbox(
        self,
        *,
        command: CommandEnvelope,
        outbox_event: OutboxEventEnvelope,
    ) -> tuple[CommandEnvelope, OutboxEventEnvelope]:
        await self._db.execute(
            orchestration_commands.insert().values(
                id=command.id,
                command_type=command.command_type,
                schema_version=command.schema_version,
                occurred_at=command.occurred_at,
                producer=command.producer,
                correlation_id=command.correlation_id,
                causation_id=command.causation_id,
                payload_json=_json_compact(command.payload),
                status=command.status.value,
                created_at=command.created_at,
            )
        )
        await self._db.execute(
            orchestration_outbox.insert().values(
                id=outbox_event.id,
                command_id=outbox_event.command_id,
                event_type=outbox_event.event_type,
                schema_version=outbox_event.schema_version,
                occurred_at=outbox_event.occurred_at,
                producer=outbox_event.producer,
                correlation_id=outbox_event.correlation_id,
                causation_id=outbox_event.causation_id,
                payload_json=_json_compact(outbox_event.payload),
                status=outbox_event.status.value,
                retry_attempt=outbox_event.retry_attempt,
                max_attempts=outbox_event.max_attempts,
                available_at=outbox_event.next_retry_at or outbox_event.created_at,
                published_at=None,
                last_error=None,
                dead_lettered_at=outbox_event.dead_lettered_at,
                dead_letter_payload_json=(
                    _json_compact(outbox_event.dead_letter_payload)
                    if outbox_event.dead_letter_payload is not None
                    else None
                ),
                created_at=outbox_event.created_at,
            )
        )
        await self._db.commit()
        return command, outbox_event

    async def get_outbox_event(self, *, outbox_event_id: str) -> OutboxEventEnvelope | None:
        result = await self._db.execute(
            select(orchestration_outbox).where(_o.id == outbox_event_id).limit(1)
        )
        row = result.first()
        if row is None:
            return None
        payload = json.loads(row.payload_json) if row.payload_json else {}
        dlp = json.loads(row.dead_letter_payload_json) if row.dead_letter_payload_json else None
        return outbox_event_from_row(row, payload, dlp)

    async def reschedule_outbox_event(
        self,
        *,
        outbox_event_id: str,
        retry_attempt: int,
        next_retry_at: str,
        last_error: str,
        payload: dict[str, object],
    ) -> None:
        await self._db.execute(
            update(orchestration_outbox)
            .where(_o.id == outbox_event_id)
            .values(
                status=OutboxStatus.PENDING.value,
                retry_attempt=retry_attempt,
                available_at=next_retry_at,
                last_error=last_error,
                payload_json=_json_compact(payload),
                dead_lettered_at=None,
                dead_letter_payload_json=None,
            )
        )
        await self._db.commit()

    async def dead_letter_outbox_event(
        self,
        *,
        outbox_event_id: str,
        dead_lettered_at: str,
        last_error: str,
        dead_letter_payload: dict[str, object],
    ) -> None:
        await self._db.execute(
            update(orchestration_outbox)
            .where(_o.id == outbox_event_id)
            .values(
                status=OutboxStatus.FAILED.value,
                dead_lettered_at=dead_lettered_at,
                last_error=last_error,
                dead_letter_payload_json=_json_compact(dead_letter_payload),
            )
        )
        await self._db.commit()
