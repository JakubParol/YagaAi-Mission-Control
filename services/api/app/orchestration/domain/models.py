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
class OrchestrationRun:
    run_id: str
    status: RunStatus
    correlation_id: str
    current_step_id: str | None
    last_event_type: str
    created_at: str
    updated_at: str
    terminal_at: str | None = None


@dataclass
class OrchestrationStep:
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
