import json

import aiosqlite

from app.orchestration.application.ports import OrchestrationRepository
from app.orchestration.domain.models import CommandEnvelope, OutboxEventEnvelope, OutboxStatus


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
                  published_at, last_error, dead_lettered_at, dead_letter_payload_json, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    (
                        json.dumps(outbox_event.dead_letter_payload, separators=(",", ":"))
                        if outbox_event.dead_letter_payload is not None
                        else None
                    ),
                    outbox_event.created_at,
                ),
            )
            await self._db.commit()
        except Exception:
            await self._db.rollback()
            raise
        return command, outbox_event

    async def get_outbox_event(self, *, outbox_event_id: str) -> OutboxEventEnvelope | None:
        cursor = await self._db.execute(
            """
            SELECT
              id, command_id, event_type, schema_version, occurred_at, producer, correlation_id,
              causation_id, payload_json, status, created_at, retry_attempt, max_attempts,
              available_at, dead_lettered_at, dead_letter_payload_json
            FROM orchestration_outbox
            WHERE id = ?
            LIMIT 1
            """,
            (outbox_event_id,),
        )
        row = await cursor.fetchone()
        await cursor.close()
        if row is None:
            return None
        return OutboxEventEnvelope(
            id=row[0],
            command_id=row[1],
            event_type=row[2],
            schema_version=row[3],
            occurred_at=row[4],
            producer=row[5],
            correlation_id=row[6],
            causation_id=row[7],
            payload=json.loads(row[8]),
            status=OutboxStatus(str(row[9])),
            created_at=row[10],
            retry_attempt=int(row[11]),
            max_attempts=int(row[12]),
            next_retry_at=row[13],
            dead_lettered_at=row[14],
            dead_letter_payload=(json.loads(row[15]) if row[15] else None),
        )

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
            """
            UPDATE orchestration_outbox
            SET status = 'PENDING',
                retry_attempt = ?,
                available_at = ?,
                last_error = ?,
                payload_json = ?,
                dead_lettered_at = NULL,
                dead_letter_payload_json = NULL
            WHERE id = ?
            """,
            (
                retry_attempt,
                next_retry_at,
                last_error,
                json.dumps(payload, separators=(",", ":"), sort_keys=True),
                outbox_event_id,
            ),
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
            """
            UPDATE orchestration_outbox
            SET status = 'FAILED',
                dead_lettered_at = ?,
                last_error = ?,
                dead_letter_payload_json = ?
            WHERE id = ?
            """,
            (
                dead_lettered_at,
                last_error,
                json.dumps(dead_letter_payload, separators=(",", ":"), sort_keys=True),
                outbox_event_id,
            ),
        )
        await self._db.commit()

    async def get_consumer_offset(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        consumer_name: str,
    ) -> str | None:
        cursor = await self._db.execute(
            """
            SELECT last_message_id
            FROM orchestration_consumer_offsets
            WHERE stream_key = ? AND consumer_group = ? AND consumer_name = ?
            LIMIT 1
            """,
            (stream_key, consumer_group, consumer_name),
        )
        row = await cursor.fetchone()
        await cursor.close()
        return str(row[0]) if row else None

    async def upsert_consumer_offset(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        consumer_name: str,
        last_message_id: str,
        updated_at: str,
    ) -> None:
        await self._db.execute(
            """
            INSERT INTO orchestration_consumer_offsets(
              stream_key, consumer_group, consumer_name, last_message_id, updated_at
            )
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(stream_key, consumer_group, consumer_name)
            DO UPDATE SET last_message_id=excluded.last_message_id, updated_at=excluded.updated_at
            """,
            (stream_key, consumer_group, consumer_name, last_message_id, updated_at),
        )
        await self._db.commit()

    async def is_message_processed(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        message_id: str,
    ) -> bool:
        cursor = await self._db.execute(
            """
            SELECT 1
            FROM orchestration_processed_messages
            WHERE stream_key = ? AND consumer_group = ? AND message_id = ?
            LIMIT 1
            """,
            (stream_key, consumer_group, message_id),
        )
        row = await cursor.fetchone()
        await cursor.close()
        return row is not None

    async def mark_message_processed(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        message_id: str,
        correlation_id: str,
        processed_at: str,
    ) -> None:
        await self._db.execute(
            """
            INSERT OR IGNORE INTO orchestration_processed_messages(
              stream_key, consumer_group, message_id, correlation_id, processed_at
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (stream_key, consumer_group, message_id, correlation_id, processed_at),
        )
        await self._db.commit()
