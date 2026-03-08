import json

import aiosqlite

from app.orchestration.application.ports import OrchestrationRepository
from app.orchestration.domain.models import CommandEnvelope, OutboxEventEnvelope


class SqliteOrchestrationRepository(OrchestrationRepository):
    def __init__(self, db: aiosqlite.Connection) -> None:
        self._db = db

    async def create_command_with_outbox(
        self,
        *,
        command: CommandEnvelope,
        outbox_event: OutboxEventEnvelope,
    ) -> tuple[CommandEnvelope, OutboxEventEnvelope]:
        try:
            await self._db.execute("BEGIN")
            await self._db.execute(
                """
                INSERT INTO orchestration_commands(
                  id, command_type, schema_version, occurred_at, producer, correlation_id,
                  causation_id, payload_json, status, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    command.id,
                    command.command_type,
                    command.schema_version,
                    command.occurred_at,
                    command.producer,
                    command.correlation_id,
                    command.causation_id,
                    json.dumps(command.payload, separators=(",", ":"), sort_keys=True),
                    command.status.value,
                    command.created_at,
                ),
            )
            await self._db.execute(
                """
                INSERT INTO orchestration_outbox(
                  id, command_id, event_type, schema_version, occurred_at, producer, correlation_id,
                  causation_id, payload_json, status, retry_attempt, max_attempts, available_at,
                  published_at, last_error, dead_lettered_at, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    outbox_event.id,
                    outbox_event.command_id,
                    outbox_event.event_type,
                    outbox_event.schema_version,
                    outbox_event.occurred_at,
                    outbox_event.producer,
                    outbox_event.correlation_id,
                    outbox_event.causation_id,
                    json.dumps(outbox_event.payload, separators=(",", ":"), sort_keys=True),
                    outbox_event.status.value,
                    outbox_event.retry_attempt,
                    outbox_event.max_attempts,
                    outbox_event.next_retry_at or outbox_event.created_at,
                    None,
                    None,
                    outbox_event.dead_lettered_at,
                    outbox_event.created_at,
                ),
            )
            await self._db.commit()
        except Exception:
            await self._db.rollback()
            raise
        return command, outbox_event
