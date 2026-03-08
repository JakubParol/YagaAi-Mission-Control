import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from app.config import settings
from app.orchestration.application.ports import OrchestrationRepository
from app.shared.api.errors import NotFoundError
from app.shared.logging import log_event


def _parse_iso8601(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _to_iso8601(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class DeliveryService:
    def __init__(self, repo: OrchestrationRepository) -> None:
        self._repo = repo
        self._base_backoff_seconds = settings.orchestration_retry_base_backoff_seconds
        self._max_backoff_seconds = settings.orchestration_retry_max_backoff_seconds
        self._dead_letter_stream = (
            f"{settings.orchestration_stream_prefix}:dead-letter:v"
            f"{settings.orchestration_stream_version}"
        )
        self._logger = logging.getLogger(__name__)

    async def record_processing_failure(
        self,
        *,
        outbox_event_id: str,
        source_stream: str,
        source_message_id: str,
        error_code: str,
        error_message: str,
        failed_at: str,
    ) -> dict[str, str | int]:
        event = await self._repo.get_outbox_event(outbox_event_id=outbox_event_id)
        if event is None:
            raise NotFoundError(f"Orchestration outbox event not found: {outbox_event_id}")

        next_attempt = event.retry_attempt + 1
        now_dt = _parse_iso8601(failed_at)
        last_error = f"{error_code}: {error_message}"
        payload = dict(event.payload)

        if next_attempt <= event.max_attempts:
            backoff_seconds = min(
                self._base_backoff_seconds * (2 ** max(next_attempt - 1, 0)),
                self._max_backoff_seconds,
            )
            next_retry_dt = now_dt + timedelta(seconds=backoff_seconds)
            payload["delivery"] = {
                "attempt": next_attempt,
                "max_attempts": event.max_attempts,
                "next_retry_at": _to_iso8601(next_retry_dt),
                "backoff_seconds": backoff_seconds,
                "last_error_code": error_code,
                "last_error_message": error_message,
            }
            await self._repo.reschedule_outbox_event(
                outbox_event_id=outbox_event_id,
                retry_attempt=next_attempt,
                next_retry_at=_to_iso8601(next_retry_dt),
                last_error=last_error,
                payload=payload,
            )
            log_event(
                self._logger,
                level=logging.WARNING,
                event="orchestration.delivery.retry_scheduled",
                outbox_event_id=outbox_event_id,
                correlation_id=event.correlation_id,
                retry_attempt=next_attempt,
                max_attempts=event.max_attempts,
                next_retry_at=_to_iso8601(next_retry_dt),
                error_code=error_code,
            )
            return {
                "decision": "RETRY",
                "outbox_event_id": outbox_event_id,
                "retry_attempt": next_attempt,
                "max_attempts": event.max_attempts,
                "next_retry_at": _to_iso8601(next_retry_dt),
            }

        dead_letter_payload: dict[str, Any] = {
            "dead_letter_reason": "MAX_ATTEMPTS_EXCEEDED",
            "dead_lettered_at": _to_iso8601(now_dt),
            "source_stream": source_stream,
            "source_message_id": source_message_id,
            "replay_hint": "Replay by re-emitting payload to original topic with new correlation.",
            "error_code": error_code,
            "error_message": error_message,
            "correlation_id": event.correlation_id,
            "causation_id": event.causation_id,
            "final_attempt": next_attempt,
            "max_attempts": event.max_attempts,
            "event_payload": payload,
        }
        await self._repo.dead_letter_outbox_event(
            outbox_event_id=outbox_event_id,
            dead_lettered_at=_to_iso8601(now_dt),
            last_error=last_error,
            dead_letter_payload=dead_letter_payload,
        )
        log_event(
            self._logger,
            level=logging.ERROR,
            event="orchestration.delivery.dead_lettered",
            outbox_event_id=outbox_event_id,
            correlation_id=event.correlation_id,
            max_attempts=event.max_attempts,
            dead_letter_stream=self._dead_letter_stream,
            error_code=error_code,
        )
        return {
            "decision": "DEAD_LETTER",
            "outbox_event_id": outbox_event_id,
            "dead_letter_stream": self._dead_letter_stream,
        }
