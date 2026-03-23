from dataclasses import dataclass
from enum import StrEnum
from typing import Any

SUPPORTED_SCHEMA_MAJOR = 1
MIN_SUPPORTED_SCHEMA_MINOR = 0
MAX_SUPPORTED_SCHEMA_MINOR = 1


class EnvelopeKind(StrEnum):
    COMMAND = "COMMAND"
    EVENT = "EVENT"


class CommandStatus(StrEnum):
    ACCEPTED = "ACCEPTED"


class OutboxStatus(StrEnum):
    PENDING = "PENDING"
    PUBLISHED = "PUBLISHED"
    FAILED = "FAILED"


class RunStatus(StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class StepStatus(StrEnum):
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    SKIPPED = "SKIPPED"


class TransitionDecision(StrEnum):
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    DUPLICATE = "DUPLICATE"


class WatchdogAction(StrEnum):
    RETRY = "RETRY"
    FAIL = "FAIL"
    QUARANTINE = "QUARANTINE"


class AgentQueueStatus(StrEnum):
    QUEUED = "QUEUED"
    DISPATCHING = "DISPATCHING"
    ACK_PENDING = "ACK_PENDING"
    PLANNING = "PLANNING"
    EXECUTING = "EXECUTING"
    BLOCKED = "BLOCKED"
    REVIEW_READY = "REVIEW_READY"
    DONE = "DONE"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


QUEUE_ELIGIBLE_WORK_ITEM_TYPES = frozenset({"STORY", "BUG"})
QUEUE_ELIGIBLE_PLANNING_STATUSES = frozenset({"TODO"})


@dataclass
class AgentQueueEntry:
    id: str
    work_item_id: str
    work_item_key: str
    work_item_type: str
    agent_id: str
    status: AgentQueueStatus
    queue_position: int
    correlation_id: str
    causation_id: str | None
    enqueued_at: str
    updated_at: str
    cancelled_at: str | None = None


@dataclass
class CommandEnvelope:
    id: str
    command_type: str
    schema_version: str
    occurred_at: str
    producer: str
    correlation_id: str
    causation_id: str | None
    payload: dict[str, Any]
    status: CommandStatus
    created_at: str


@dataclass
class OutboxEventEnvelope:
    id: str
    command_id: str
    event_type: str
    schema_version: str
    occurred_at: str
    producer: str
    correlation_id: str
    causation_id: str | None
    payload: dict[str, Any]
    status: OutboxStatus
    created_at: str
    retry_attempt: int = 1
    max_attempts: int = 5
    next_retry_at: str | None = None
    dead_lettered_at: str | None = None
    dead_letter_payload: dict[str, Any] | None = None


@dataclass
class ControlPlaneRun:
    run_id: str
    status: RunStatus
    correlation_id: str
    current_step_id: str | None
    last_event_type: str
    created_at: str
    updated_at: str
    run_type: str = "DEFAULT"
    lease_owner: str | None = None
    lease_token: str | None = None
    last_heartbeat_at: str | None = None
    watchdog_timeout_at: str | None = None
    watchdog_attempt: int = 0
    watchdog_state: str = "NONE"
    terminal_at: str | None = None


@dataclass
class ControlPlaneStep:
    step_id: str
    run_id: str
    status: StepStatus
    last_event_type: str
    created_at: str
    updated_at: str
    terminal_at: str | None = None


@dataclass
class RunTimelineEntry:
    id: str
    run_id: str
    step_id: str | None
    message_id: str | None
    event_type: str
    decision: TransitionDecision
    reason_code: str | None
    reason_message: str | None
    correlation_id: str
    causation_id: str | None
    payload: dict[str, Any]
    occurred_at: str
    created_at: str


@dataclass
class RunReadModel:
    run_id: str
    status: RunStatus
    correlation_id: str
    causation_id: str | None
    current_step_id: str | None
    last_event_type: str
    run_type: str
    lease_owner: str | None
    lease_token: str | None
    last_heartbeat_at: str | None
    watchdog_timeout_at: str | None
    watchdog_attempt: int
    watchdog_state: str
    terminal_at: str | None
    created_at: str
    updated_at: str


@dataclass
class TimelineEntryReadModel:
    id: str
    run_id: str
    run_status: RunStatus
    step_id: str | None
    message_id: str | None
    event_type: str
    decision: TransitionDecision
    reason_code: str | None
    reason_message: str | None
    correlation_id: str
    causation_id: str | None
    payload: dict[str, Any]
    occurred_at: str
    created_at: str


@dataclass
class RunAttemptReadModel:
    outbox_event_id: str
    command_id: str
    run_id: str
    event_type: str
    occurred_at: str
    status: OutboxStatus
    retry_attempt: int
    max_attempts: int
    next_retry_at: str | None
    dead_lettered_at: str | None
    last_error: str | None
    correlation_id: str
    causation_id: str | None


@dataclass
class ControlPlaneHealthSnapshot:
    queue_pending: int
    queue_oldest_pending_at: str | None
    retries_total: int
    dead_letter_total: int
    watchdog_interventions: int
    run_latencies_ms: list[float]


@dataclass
class ControlPlaneHealthMetrics:
    queue_pending: int
    queue_oldest_pending_age_seconds: int | None
    retries_total: int
    dead_letter_total: int
    watchdog_interventions: int
    run_latency_avg_ms: float | None
    run_latency_p95_ms: float | None
    generated_at: str
