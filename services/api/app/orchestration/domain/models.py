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
