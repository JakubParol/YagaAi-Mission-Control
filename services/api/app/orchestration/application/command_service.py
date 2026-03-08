import logging
import re
from datetime import datetime
from typing import Any

from app.config import settings
from app.orchestration.application.ports import OrchestrationRepository
from app.orchestration.domain.models import (
    MAX_SUPPORTED_SCHEMA_MINOR,
    MIN_SUPPORTED_SCHEMA_MINOR,
    SUPPORTED_SCHEMA_MAJOR,
    CommandEnvelope,
    CommandStatus,
    OutboxEventEnvelope,
    OutboxStatus,
)
from app.shared.api.errors import ValidationError
from app.shared.logging import log_event
from app.shared.utils import new_uuid, utc_now

_COMMAND_TYPE_RE = re.compile(r"^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*){2,}$")
_SCHEMA_VERSION_RE = re.compile(r"^(?P<major>\d+)\.(?P<minor>\d+)$")
logger = logging.getLogger(__name__)


class CommandService:
    def __init__(self, repo: OrchestrationRepository) -> None:
        self._repo = repo
        self._default_max_attempts = settings.orchestration_retry_max_attempts
        self._base_backoff_seconds = settings.orchestration_retry_base_backoff_seconds

    async def submit_command(
        self,
        *,
        command_type: str,
        schema_version: str,
        payload: dict[str, Any],
        metadata: dict[str, str | None],
    ) -> tuple[CommandEnvelope, OutboxEventEnvelope]:
        self._validate_command_type(command_type)
        self._validate_schema_version(schema_version)
        producer = (metadata.get("producer") or "").strip()
        correlation_id = (metadata.get("correlation_id") or "").strip()
        occurred_at = (metadata.get("occurred_at") or "").strip()
        causation_id = metadata.get("causation_id")

        details: list[dict[str, str]] = []
        if not producer:
            details.append({"field": "metadata.producer", "message": "producer is required"})
        if not correlation_id:
            details.append(
                {"field": "metadata.correlation_id", "message": "correlation_id is required"}
            )
        if not occurred_at:
            details.append({"field": "metadata.occurred_at", "message": "occurred_at is required"})
        else:
            self._validate_iso8601(occurred_at, field="metadata.occurred_at")
        if details:
            raise ValidationError("Invalid command metadata", details=details)

        command_id = new_uuid()
        outbox_event_id = new_uuid()
        created_at = utc_now()
        command = CommandEnvelope(
            id=command_id,
            command_type=command_type,
            schema_version=schema_version,
            occurred_at=occurred_at,
            producer=producer,
            correlation_id=correlation_id,
            causation_id=causation_id,
            payload=payload,
            status=CommandStatus.ACCEPTED,
            created_at=created_at,
        )
        outbox_event = OutboxEventEnvelope(
            id=outbox_event_id,
            command_id=command_id,
            event_type=f"{command_type}.accepted",
            schema_version=schema_version,
            occurred_at=occurred_at,
            producer=producer,
            correlation_id=correlation_id,
            causation_id=causation_id,
            payload={
                "accepted_command_id": command_id,
                "accepted_command_type": command_type,
                "command_payload": payload,
                "delivery": self._build_delivery_metadata(
                    occurred_at=occurred_at,
                    retry_attempt=1,
                    max_attempts=self._default_max_attempts,
                ),
            },
            status=OutboxStatus.PENDING,
            created_at=created_at,
            retry_attempt=1,
            max_attempts=self._default_max_attempts,
            next_retry_at=occurred_at,
        )
        created_command, created_outbox_event = await self._repo.create_command_with_outbox(
            command=command, outbox_event=outbox_event
        )
        log_event(
            logger,
            level=logging.INFO,
            event="orchestration.command.accepted",
            command_id=created_command.id,
            command_type=created_command.command_type,
            correlation_id=created_command.correlation_id,
            causation_id=created_command.causation_id,
            run_id=str(payload.get("run_id", "")),
            outbox_event_id=created_outbox_event.id,
        )
        return created_command, created_outbox_event

    def _validate_command_type(self, command_type: str) -> None:
        if _COMMAND_TYPE_RE.fullmatch(command_type):
            return
        raise ValidationError(
            "Invalid command type taxonomy",
            details=[
                {
                    "field": "command_type",
                    "message": (
                        "command_type must follow taxonomy `domain.aggregate.action` "
                        "with lowercase segments"
                    ),
                }
            ],
        )

    def _validate_schema_version(self, schema_version: str) -> None:
        match = _SCHEMA_VERSION_RE.fullmatch(schema_version)
        if not match:
            raise ValidationError(
                "Invalid schema version format",
                details=[
                    {
                        "field": "schema_version",
                        "message": "schema_version must match <major>.<minor>",
                    }
                ],
            )
        major = int(match.group("major"))
        minor = int(match.group("minor"))

        if major != SUPPORTED_SCHEMA_MAJOR:
            raise ValidationError(
                "Unsupported schema major version",
                details=[
                    {
                        "field": "schema_version",
                        "message": (
                            f"supported major version is {SUPPORTED_SCHEMA_MAJOR}; " f"got {major}"
                        ),
                    }
                ],
            )
        if minor < MIN_SUPPORTED_SCHEMA_MINOR or minor > MAX_SUPPORTED_SCHEMA_MINOR:
            raise ValidationError(
                "Unsupported schema minor version",
                details=[
                    {
                        "field": "schema_version",
                        "message": (
                            "supported minor range is "
                            f"{MIN_SUPPORTED_SCHEMA_MINOR}-{MAX_SUPPORTED_SCHEMA_MINOR}; "
                            f"got {minor}"
                        ),
                    }
                ],
            )

    def _validate_iso8601(self, value: str, *, field: str) -> None:
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValidationError(
                "Invalid timestamp",
                details=[{"field": field, "message": "must be a valid ISO-8601 timestamp"}],
            ) from exc

    def _build_delivery_metadata(
        self,
        *,
        occurred_at: str,
        retry_attempt: int,
        max_attempts: int,
    ) -> dict[str, Any]:
        bounded_max_attempts = max(max_attempts, 1)
        next_backoff_seconds = min(
            self._base_backoff_seconds * (2 ** max(retry_attempt - 1, 0)),
            settings.orchestration_retry_max_backoff_seconds,
        )
        return {
            "attempt": retry_attempt,
            "max_attempts": bounded_max_attempts,
            "next_retry_at": occurred_at,
            "backoff_seconds": next_backoff_seconds,
        }
