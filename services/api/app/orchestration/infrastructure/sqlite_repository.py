import json
from typing import Any, TypeAlias

from app.orchestration.application.ports import OrchestrationRepository
from app.orchestration.domain.models import (
    CommandEnvelope,
    OrchestrationHealthSnapshot,
    OrchestrationRun,
    OrchestrationStep,
    OutboxEventEnvelope,
    OutboxStatus,
    RunAttemptReadModel,
    RunReadModel,
    RunStatus,
    RunTimelineEntry,
    StepStatus,
    TimelineEntryReadModel,
    TransitionDecision,
)

DbConnection: TypeAlias = Any


class SqliteOrchestrationRepository(OrchestrationRepository):
    def __init__(self, db: DbConnection) -> None:
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
        try:
            await self._db.execute("BEGIN")
            await self._db.execute(
                """
                INSERT OR IGNORE INTO orchestration_processed_messages(
                  stream_key, consumer_group, message_id, correlation_id, processed_at
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (stream_key, consumer_group, message_id, correlation_id, processed_at),
            )
            await self._db.execute(
                """
                INSERT INTO orchestration_consumer_offsets(
                  stream_key, consumer_group, consumer_name, last_message_id, updated_at
                )
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(stream_key, consumer_group, consumer_name)
                DO UPDATE SET
                  last_message_id=excluded.last_message_id,
                  updated_at=excluded.updated_at
                """,
                (stream_key, consumer_group, consumer_name, message_id, processed_at),
            )
            await self._db.commit()
        except Exception:
            await self._db.rollback()
            raise

    async def get_run(self, *, run_id: str) -> OrchestrationRun | None:
        cursor = await self._db.execute(
            """
            SELECT
              run_id, status, correlation_id, current_step_id, last_event_type,
              created_at, updated_at, run_type, lease_owner, lease_token,
              last_heartbeat_at, watchdog_timeout_at, watchdog_attempt, watchdog_state, terminal_at
            FROM orchestration_runs
            WHERE run_id = ?
            LIMIT 1
            """,
            (run_id,),
        )
        row = await cursor.fetchone()
        await cursor.close()
        if row is None:
            return None
        return OrchestrationRun(
            run_id=str(row[0]),
            status=RunStatus(str(row[1])),
            correlation_id=str(row[2]),
            current_step_id=(str(row[3]) if row[3] else None),
            last_event_type=str(row[4]),
            created_at=str(row[5]),
            updated_at=str(row[6]),
            run_type=str(row[7] or "DEFAULT"),
            lease_owner=(str(row[8]) if row[8] else None),
            lease_token=(str(row[9]) if row[9] else None),
            last_heartbeat_at=(str(row[10]) if row[10] else None),
            watchdog_timeout_at=(str(row[11]) if row[11] else None),
            watchdog_attempt=int(row[12] or 0),
            watchdog_state=str(row[13] or "NONE"),
            terminal_at=(str(row[14]) if row[14] else None),
        )

    async def create_run(self, *, run: OrchestrationRun) -> None:
        await self._db.execute(
            """
            INSERT INTO orchestration_runs(
              run_id, status, correlation_id, current_step_id, last_event_type,
              created_at, updated_at, run_type, lease_owner, lease_token,
              last_heartbeat_at, watchdog_timeout_at, watchdog_attempt, watchdog_state, terminal_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run.run_id,
                run.status.value,
                run.correlation_id,
                run.current_step_id,
                run.last_event_type,
                run.created_at,
                run.updated_at,
                run.run_type,
                run.lease_owner,
                run.lease_token,
                run.last_heartbeat_at,
                run.watchdog_timeout_at,
                run.watchdog_attempt,
                run.watchdog_state,
                run.terminal_at,
            ),
        )
        await self._db.commit()

    async def update_run_status(
        self,
        *,
        run_id: str,
        status: RunStatus,
        current_step_id: str | None,
        last_event_type: str,
        updated_at: str,
        terminal_at: str | None,
    ) -> None:
        await self._db.execute(
            """
            UPDATE orchestration_runs
            SET status = ?,
                current_step_id = ?,
                last_event_type = ?,
                updated_at = ?,
                terminal_at = ?
            WHERE run_id = ?
            """,
            (
                status.value,
                current_step_id,
                last_event_type,
                updated_at,
                terminal_at,
                run_id,
            ),
        )
        await self._db.commit()

    async def list_in_flight_runs(self) -> list[OrchestrationRun]:
        cursor = await self._db.execute("""
            SELECT
              run_id, status, correlation_id, current_step_id, last_event_type,
              created_at, updated_at, run_type, lease_owner, lease_token,
              last_heartbeat_at, watchdog_timeout_at, watchdog_attempt, watchdog_state, terminal_at
            FROM orchestration_runs
            WHERE status IN ('PENDING', 'RUNNING')
            ORDER BY created_at ASC, run_id ASC
            """)
        rows = await cursor.fetchall()
        await cursor.close()
        return [
            OrchestrationRun(
                run_id=str(row[0]),
                status=RunStatus(str(row[1])),
                correlation_id=str(row[2]),
                current_step_id=(str(row[3]) if row[3] else None),
                last_event_type=str(row[4]),
                created_at=str(row[5]),
                updated_at=str(row[6]),
                run_type=str(row[7] or "DEFAULT"),
                lease_owner=(str(row[8]) if row[8] else None),
                lease_token=(str(row[9]) if row[9] else None),
                last_heartbeat_at=(str(row[10]) if row[10] else None),
                watchdog_timeout_at=(str(row[11]) if row[11] else None),
                watchdog_attempt=int(row[12] or 0),
                watchdog_state=str(row[13] or "NONE"),
                terminal_at=(str(row[14]) if row[14] else None),
            )
            for row in rows
        ]

    async def get_step(self, *, run_id: str, step_id: str) -> OrchestrationStep | None:
        cursor = await self._db.execute(
            """
            SELECT
              step_id, run_id, status, last_event_type, created_at, updated_at, terminal_at
            FROM orchestration_run_steps
            WHERE run_id = ? AND step_id = ?
            LIMIT 1
            """,
            (run_id, step_id),
        )
        row = await cursor.fetchone()
        await cursor.close()
        if row is None:
            return None
        return OrchestrationStep(
            step_id=str(row[0]),
            run_id=str(row[1]),
            status=StepStatus(str(row[2])),
            last_event_type=str(row[3]),
            created_at=str(row[4]),
            updated_at=str(row[5]),
            terminal_at=(str(row[6]) if row[6] else None),
        )

    async def create_step(self, *, step: OrchestrationStep) -> None:
        await self._db.execute(
            """
            INSERT INTO orchestration_run_steps(
              step_id, run_id, status, last_event_type, created_at, updated_at, terminal_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                step.step_id,
                step.run_id,
                step.status.value,
                step.last_event_type,
                step.created_at,
                step.updated_at,
                step.terminal_at,
            ),
        )
        await self._db.commit()

    async def update_step_status(
        self,
        *,
        run_id: str,
        step_id: str,
        status: StepStatus,
        last_event_type: str,
        updated_at: str,
        terminal_at: str | None,
    ) -> None:
        await self._db.execute(
            """
            UPDATE orchestration_run_steps
            SET status = ?,
                last_event_type = ?,
                updated_at = ?,
                terminal_at = ?
            WHERE run_id = ? AND step_id = ?
            """,
            (status.value, last_event_type, updated_at, terminal_at, run_id, step_id),
        )
        await self._db.commit()

    async def append_timeline_entry(self, *, entry: RunTimelineEntry) -> None:
        await self._db.execute(
            """
            INSERT INTO orchestration_run_timeline(
              id, run_id, step_id, message_id, event_type, decision, reason_code, reason_message,
              correlation_id, causation_id, payload_json, occurred_at, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.id,
                entry.run_id,
                entry.step_id,
                entry.message_id,
                entry.event_type,
                entry.decision.value,
                entry.reason_code,
                entry.reason_message,
                entry.correlation_id,
                entry.causation_id,
                json.dumps(entry.payload, separators=(",", ":"), sort_keys=True),
                entry.occurred_at,
                entry.created_at,
            ),
        )
        await self._db.commit()

    async def compare_and_set_run_lease(
        self,
        *,
        run_id: str,
        expected_lease_token: str | None,
        lease_owner: str | None,
        new_lease_token: str | None,
        heartbeat_at: str | None,
        timeout_at: str | None,
        updated_at: str,
    ) -> bool:
        if expected_lease_token is None:
            cursor = await self._db.execute(
                """
                UPDATE orchestration_runs
                SET lease_owner = ?,
                    lease_token = ?,
                    last_heartbeat_at = ?,
                    watchdog_timeout_at = ?,
                    updated_at = ?
                WHERE run_id = ? AND lease_token IS NULL
                """,
                (
                    lease_owner,
                    new_lease_token,
                    heartbeat_at,
                    timeout_at,
                    updated_at,
                    run_id,
                ),
            )
        else:
            cursor = await self._db.execute(
                """
                UPDATE orchestration_runs
                SET lease_owner = ?,
                    lease_token = ?,
                    last_heartbeat_at = ?,
                    watchdog_timeout_at = ?,
                    updated_at = ?
                WHERE run_id = ? AND lease_token = ?
                """,
                (
                    lease_owner,
                    new_lease_token,
                    heartbeat_at,
                    timeout_at,
                    updated_at,
                    run_id,
                    expected_lease_token,
                ),
            )
        await self._db.commit()
        return int(cursor.rowcount or 0) > 0

    async def apply_watchdog_action_if_lease_matches(
        self,
        *,
        run_id: str,
        expected_lease_token: str | None,
        next_status: RunStatus,
        current_step_id: str | None,
        last_event_type: str,
        updated_at: str,
        terminal_at: str | None,
        watchdog_attempt: int,
        watchdog_state: str,
        clear_lease: bool,
    ) -> bool:
        lease_owner = None if clear_lease else "watchdog"
        lease_token = None if clear_lease else expected_lease_token
        heartbeat_at = None if clear_lease else updated_at
        if expected_lease_token is None:
            cursor = await self._db.execute(
                """
                UPDATE orchestration_runs
                SET status = ?,
                    current_step_id = ?,
                    last_event_type = ?,
                    updated_at = ?,
                    terminal_at = ?,
                    watchdog_attempt = ?,
                    watchdog_state = ?,
                    lease_owner = ?,
                    lease_token = ?,
                    last_heartbeat_at = ?
                WHERE run_id = ? AND lease_token IS NULL
                """,
                (
                    next_status.value,
                    current_step_id,
                    last_event_type,
                    updated_at,
                    terminal_at,
                    watchdog_attempt,
                    watchdog_state,
                    lease_owner,
                    lease_token,
                    heartbeat_at,
                    run_id,
                ),
            )
        else:
            cursor = await self._db.execute(
                """
                UPDATE orchestration_runs
                SET status = ?,
                    current_step_id = ?,
                    last_event_type = ?,
                    updated_at = ?,
                    terminal_at = ?,
                    watchdog_attempt = ?,
                    watchdog_state = ?,
                    lease_owner = ?,
                    lease_token = ?,
                    last_heartbeat_at = ?
                WHERE run_id = ? AND lease_token = ?
                """,
                (
                    next_status.value,
                    current_step_id,
                    last_event_type,
                    updated_at,
                    terminal_at,
                    watchdog_attempt,
                    watchdog_state,
                    lease_owner,
                    lease_token,
                    heartbeat_at,
                    run_id,
                    expected_lease_token,
                ),
            )
        await self._db.commit()
        return int(cursor.rowcount or 0) > 0

    async def list_runs(
        self,
        *,
        run_id: str | None,
        status: RunStatus | None,
        limit: int,
        offset: int,
    ) -> tuple[list[RunReadModel], int]:
        status_value = status.value if status is not None else None
        condition_params: tuple[object, ...] = (
            run_id,
            run_id,
            status_value,
            status_value,
        )
        count_cursor = await self._db.execute(
            """
            SELECT COUNT(*)
            FROM orchestration_runs r
            WHERE (? IS NULL OR r.run_id = ?)
              AND (? IS NULL OR r.status = ?)
            """,
            condition_params,
        )
        count_row = await count_cursor.fetchone()
        await count_cursor.close()
        total = int(count_row[0] if count_row else 0)

        list_cursor = await self._db.execute(
            """
            SELECT
              r.run_id,
              r.status,
              r.correlation_id,
              (
                SELECT t.causation_id
                FROM orchestration_run_timeline t
                WHERE t.run_id = r.run_id
                ORDER BY t.occurred_at DESC, t.id DESC
                LIMIT 1
              ) AS causation_id,
              r.current_step_id,
              r.last_event_type,
              r.run_type,
              r.lease_owner,
              r.lease_token,
              r.last_heartbeat_at,
              r.watchdog_timeout_at,
              r.watchdog_attempt,
              r.watchdog_state,
              r.terminal_at,
              r.created_at,
              r.updated_at
            FROM orchestration_runs r
            WHERE (? IS NULL OR r.run_id = ?)
              AND (? IS NULL OR r.status = ?)
            ORDER BY r.updated_at DESC, r.run_id DESC
            LIMIT ? OFFSET ?
            """,
            (*condition_params, limit, offset),
        )
        rows = await list_cursor.fetchall()
        await list_cursor.close()

        return (
            [
                RunReadModel(
                    run_id=str(row[0]),
                    status=RunStatus(str(row[1])),
                    correlation_id=str(row[2]),
                    causation_id=(str(row[3]) if row[3] else None),
                    current_step_id=(str(row[4]) if row[4] else None),
                    last_event_type=str(row[5]),
                    run_type=str(row[6] or "DEFAULT"),
                    lease_owner=(str(row[7]) if row[7] else None),
                    lease_token=(str(row[8]) if row[8] else None),
                    last_heartbeat_at=(str(row[9]) if row[9] else None),
                    watchdog_timeout_at=(str(row[10]) if row[10] else None),
                    watchdog_attempt=int(row[11] or 0),
                    watchdog_state=str(row[12] or "NONE"),
                    terminal_at=(str(row[13]) if row[13] else None),
                    created_at=str(row[14]),
                    updated_at=str(row[15]),
                )
                for row in rows
            ],
            total,
        )

    async def get_run_read_model(self, *, run_id: str) -> RunReadModel | None:
        rows, _ = await self.list_runs(run_id=run_id, status=None, limit=1, offset=0)
        if not rows:
            return None
        return rows[0]

    async def list_timeline_entries(
        self,
        *,
        run_id: str | None,
        run_status: RunStatus | None,
        event_type: str | None,
        occurred_after: str | None,
        occurred_before: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[TimelineEntryReadModel], int]:
        status_value = run_status.value if run_status is not None else None
        condition_params: tuple[object, ...] = (
            run_id,
            run_id,
            status_value,
            status_value,
            event_type,
            event_type,
            occurred_after,
            occurred_after,
            occurred_before,
            occurred_before,
        )
        count_cursor = await self._db.execute(
            """
            SELECT COUNT(*)
            FROM orchestration_run_timeline t
            INNER JOIN orchestration_runs r ON r.run_id = t.run_id
            WHERE (? IS NULL OR t.run_id = ?)
              AND (? IS NULL OR r.status = ?)
              AND (? IS NULL OR t.event_type = ?)
              AND (? IS NULL OR t.occurred_at >= ?)
              AND (? IS NULL OR t.occurred_at <= ?)
            """,
            condition_params,
        )
        count_row = await count_cursor.fetchone()
        await count_cursor.close()
        total = int(count_row[0] if count_row else 0)

        list_cursor = await self._db.execute(
            """
            SELECT
              t.id,
              t.run_id,
              r.status,
              t.step_id,
              t.message_id,
              t.event_type,
              t.decision,
              t.reason_code,
              t.reason_message,
              t.correlation_id,
              t.causation_id,
              t.payload_json,
              t.occurred_at,
              t.created_at
            FROM orchestration_run_timeline t
            INNER JOIN orchestration_runs r ON r.run_id = t.run_id
            WHERE (? IS NULL OR t.run_id = ?)
              AND (? IS NULL OR r.status = ?)
              AND (? IS NULL OR t.event_type = ?)
              AND (? IS NULL OR t.occurred_at >= ?)
              AND (? IS NULL OR t.occurred_at <= ?)
            ORDER BY t.occurred_at DESC, t.id DESC
            LIMIT ? OFFSET ?
            """,
            (*condition_params, limit, offset),
        )
        rows = await list_cursor.fetchall()
        await list_cursor.close()

        return (
            [
                TimelineEntryReadModel(
                    id=str(row[0]),
                    run_id=str(row[1]),
                    run_status=RunStatus(str(row[2])),
                    step_id=(str(row[3]) if row[3] else None),
                    message_id=(str(row[4]) if row[4] else None),
                    event_type=str(row[5]),
                    decision=TransitionDecision(str(row[6])),
                    reason_code=(str(row[7]) if row[7] else None),
                    reason_message=(str(row[8]) if row[8] else None),
                    correlation_id=str(row[9]),
                    causation_id=(str(row[10]) if row[10] else None),
                    payload=(json.loads(str(row[11])) if row[11] else {}),
                    occurred_at=str(row[12]),
                    created_at=str(row[13]),
                )
                for row in rows
            ],
            total,
        )

    async def list_run_attempts(
        self,
        *,
        run_id: str,
        limit: int,
        offset: int,
    ) -> tuple[list[RunAttemptReadModel], int]:
        count_cursor = await self._db.execute(
            """
            SELECT COUNT(*)
            FROM orchestration_outbox o
            INNER JOIN orchestration_runs r ON r.correlation_id = o.correlation_id
            WHERE r.run_id = ?
            """,
            (run_id,),
        )
        count_row = await count_cursor.fetchone()
        await count_cursor.close()
        total = int(count_row[0] if count_row else 0)

        list_cursor = await self._db.execute(
            """
            SELECT
              o.id,
              o.command_id,
              r.run_id,
              o.event_type,
              o.occurred_at,
              o.status,
              o.retry_attempt,
              o.max_attempts,
              o.available_at,
              o.dead_lettered_at,
              o.last_error,
              o.correlation_id,
              o.causation_id
            FROM orchestration_outbox o
            INNER JOIN orchestration_runs r ON r.correlation_id = o.correlation_id
            WHERE r.run_id = ?
            ORDER BY o.occurred_at DESC, o.id DESC
            LIMIT ? OFFSET ?
            """,
            (run_id, limit, offset),
        )
        rows = await list_cursor.fetchall()
        await list_cursor.close()

        return (
            [
                RunAttemptReadModel(
                    outbox_event_id=str(row[0]),
                    command_id=str(row[1]),
                    run_id=str(row[2]),
                    event_type=str(row[3]),
                    occurred_at=str(row[4]),
                    status=OutboxStatus(str(row[5])),
                    retry_attempt=int(row[6]),
                    max_attempts=int(row[7]),
                    next_retry_at=(str(row[8]) if row[8] else None),
                    dead_lettered_at=(str(row[9]) if row[9] else None),
                    last_error=(str(row[10]) if row[10] else None),
                    correlation_id=str(row[11]),
                    causation_id=(str(row[12]) if row[12] else None),
                )
                for row in rows
            ],
            total,
        )

    async def get_health_snapshot(self) -> OrchestrationHealthSnapshot:
        pending_cursor = await self._db.execute("""
            SELECT COUNT(*), MIN(available_at)
            FROM orchestration_outbox
            WHERE status = 'PENDING'
            """)
        pending_row = await pending_cursor.fetchone()
        await pending_cursor.close()
        queue_pending = int(pending_row[0] if pending_row and pending_row[0] is not None else 0)
        queue_oldest_pending_at = (
            str(pending_row[1]) if pending_row and pending_row[1] is not None else None
        )

        retries_cursor = await self._db.execute("""
            SELECT COUNT(*)
            FROM orchestration_outbox
            WHERE retry_attempt > 1
            """)
        retries_row = await retries_cursor.fetchone()
        await retries_cursor.close()
        retries_total = int(retries_row[0] if retries_row and retries_row[0] is not None else 0)

        dead_letter_cursor = await self._db.execute("""
            SELECT COUNT(*)
            FROM orchestration_outbox
            WHERE dead_lettered_at IS NOT NULL OR status = 'FAILED'
            """)
        dead_letter_row = await dead_letter_cursor.fetchone()
        await dead_letter_cursor.close()
        dead_letter_total = int(
            dead_letter_row[0] if dead_letter_row and dead_letter_row[0] is not None else 0
        )

        watchdog_cursor = await self._db.execute("""
            SELECT COUNT(*)
            FROM orchestration_run_timeline
            WHERE event_type = 'orchestration.watchdog.action'
              AND decision = 'ACCEPTED'
            """)
        watchdog_row = await watchdog_cursor.fetchone()
        await watchdog_cursor.close()
        watchdog_interventions = int(
            watchdog_row[0] if watchdog_row and watchdog_row[0] is not None else 0
        )

        latencies_cursor = await self._db.execute("""
            SELECT ((julianday(terminal_at) - julianday(created_at)) * 86400000.0)
            FROM orchestration_runs
            WHERE terminal_at IS NOT NULL
            """)
        latency_rows = await latencies_cursor.fetchall()
        await latencies_cursor.close()
        run_latencies_ms = [
            float(row[0])
            for row in latency_rows
            if row and row[0] is not None and float(row[0]) >= 0
        ]

        return OrchestrationHealthSnapshot(
            queue_pending=queue_pending,
            queue_oldest_pending_at=queue_oldest_pending_at,
            retries_total=retries_total,
            dead_letter_total=dead_letter_total,
            watchdog_interventions=watchdog_interventions,
            run_latencies_ms=run_latencies_ms,
        )
