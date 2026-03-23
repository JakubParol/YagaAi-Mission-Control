from typing import Any

from sqlalchemy import Row

from app.control_plane.domain.models import (
    AgentQueueEntry,
    AgentQueueStatus,
    ControlPlaneRun,
    ControlPlaneStep,
    OutboxEventEnvelope,
    OutboxStatus,
    RunAttemptReadModel,
    RunReadModel,
    RunStatus,
    StepStatus,
    TimelineEntryReadModel,
    TransitionDecision,
)


def run_from_row(row: Row[Any]) -> ControlPlaneRun:
    return ControlPlaneRun(
        run_id=str(row.run_id),
        status=RunStatus(str(row.status)),
        correlation_id=str(row.correlation_id),
        current_step_id=(str(row.current_step_id) if row.current_step_id else None),
        last_event_type=str(row.last_event_type),
        created_at=str(row.created_at),
        updated_at=str(row.updated_at),
        run_type=str(row.run_type or "DEFAULT"),
        lease_owner=(str(row.lease_owner) if row.lease_owner else None),
        lease_token=(str(row.lease_token) if row.lease_token else None),
        last_heartbeat_at=(str(row.last_heartbeat_at) if row.last_heartbeat_at else None),
        watchdog_timeout_at=(str(row.watchdog_timeout_at) if row.watchdog_timeout_at else None),
        watchdog_attempt=int(row.watchdog_attempt or 0),
        watchdog_state=str(row.watchdog_state or "NONE"),
        terminal_at=(str(row.terminal_at) if row.terminal_at else None),
    )


def step_from_row(row: Row[Any]) -> ControlPlaneStep:
    return ControlPlaneStep(
        step_id=str(row.step_id),
        run_id=str(row.run_id),
        status=StepStatus(str(row.status)),
        last_event_type=str(row.last_event_type),
        created_at=str(row.created_at),
        updated_at=str(row.updated_at),
        terminal_at=(str(row.terminal_at) if row.terminal_at else None),
    )


def outbox_event_from_row(
    row: Row[Any],
    payload: dict[str, Any],
    dead_letter_payload: dict[str, Any] | None,
) -> OutboxEventEnvelope:
    return OutboxEventEnvelope(
        id=str(row.id),
        command_id=str(row.command_id),
        event_type=str(row.event_type),
        schema_version=str(row.schema_version),
        occurred_at=str(row.occurred_at),
        producer=str(row.producer),
        correlation_id=str(row.correlation_id),
        causation_id=(str(row.causation_id) if row.causation_id else None),
        payload=payload,
        status=OutboxStatus(str(row.status)),
        created_at=str(row.created_at),
        retry_attempt=int(row.retry_attempt),
        max_attempts=int(row.max_attempts),
        next_retry_at=(str(row.available_at) if row.available_at else None),
        dead_lettered_at=(str(row.dead_lettered_at) if row.dead_lettered_at else None),
        dead_letter_payload=dead_letter_payload,
    )


def run_read_model_from_row(row: Row[Any]) -> RunReadModel:
    return RunReadModel(
        run_id=str(row.run_id),
        status=RunStatus(str(row.status)),
        correlation_id=str(row.correlation_id),
        causation_id=(str(row.causation_id) if row.causation_id else None),
        current_step_id=(str(row.current_step_id) if row.current_step_id else None),
        last_event_type=str(row.last_event_type),
        run_type=str(row.run_type or "DEFAULT"),
        lease_owner=(str(row.lease_owner) if row.lease_owner else None),
        lease_token=(str(row.lease_token) if row.lease_token else None),
        last_heartbeat_at=(str(row.last_heartbeat_at) if row.last_heartbeat_at else None),
        watchdog_timeout_at=(str(row.watchdog_timeout_at) if row.watchdog_timeout_at else None),
        watchdog_attempt=int(row.watchdog_attempt or 0),
        watchdog_state=str(row.watchdog_state or "NONE"),
        terminal_at=(str(row.terminal_at) if row.terminal_at else None),
        created_at=str(row.created_at),
        updated_at=str(row.updated_at),
    )


def timeline_entry_from_row(row: Row[Any], payload: dict[str, Any]) -> TimelineEntryReadModel:
    return TimelineEntryReadModel(
        id=str(row.id),
        run_id=str(row.run_id),
        run_status=RunStatus(str(row.run_status)),
        step_id=(str(row.step_id) if row.step_id else None),
        message_id=(str(row.message_id) if row.message_id else None),
        event_type=str(row.event_type),
        decision=TransitionDecision(str(row.decision)),
        reason_code=(str(row.reason_code) if row.reason_code else None),
        reason_message=(str(row.reason_message) if row.reason_message else None),
        correlation_id=str(row.correlation_id),
        causation_id=(str(row.causation_id) if row.causation_id else None),
        payload=payload,
        occurred_at=str(row.occurred_at),
        created_at=str(row.created_at),
    )


def run_attempt_from_row(row: Row[Any]) -> RunAttemptReadModel:
    return RunAttemptReadModel(
        outbox_event_id=str(row.id),
        command_id=str(row.command_id),
        run_id=str(row.run_id),
        event_type=str(row.event_type),
        occurred_at=str(row.occurred_at),
        status=OutboxStatus(str(row.status)),
        retry_attempt=int(row.retry_attempt),
        max_attempts=int(row.max_attempts),
        next_retry_at=(str(row.available_at) if row.available_at else None),
        dead_lettered_at=(str(row.dead_lettered_at) if row.dead_lettered_at else None),
        last_error=(str(row.last_error) if row.last_error else None),
        correlation_id=str(row.correlation_id),
        causation_id=(str(row.causation_id) if row.causation_id else None),
    )


def queue_entry_from_row(row: Row[Any]) -> AgentQueueEntry:
    return AgentQueueEntry(
        id=str(row.id),
        work_item_id=str(row.work_item_id),
        work_item_key=str(row.work_item_key),
        work_item_type=str(row.work_item_type),
        work_item_title=str(row.work_item_title) if row.work_item_title else "",
        agent_id=str(row.agent_id),
        status=AgentQueueStatus(str(row.status)),
        queue_position=int(row.queue_position),
        correlation_id=str(row.correlation_id),
        causation_id=(str(row.causation_id) if row.causation_id else None),
        enqueued_at=str(row.enqueued_at),
        updated_at=str(row.updated_at),
        cancelled_at=(str(row.cancelled_at) if row.cancelled_at else None),
    )
