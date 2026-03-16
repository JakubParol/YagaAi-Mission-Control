from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from app.config import settings
from app.orchestration.application.ports import ConsumerRepository, RunRepository
from app.orchestration.domain.models import (
    OrchestrationRun,
    OrchestrationStep,
    RunStatus,
    RunTimelineEntry,
    StepStatus,
    TransitionDecision,
)
from app.shared.logging import log_event
from app.shared.utils import new_uuid, utc_now

_RUN_EVENT_TO_STATUS: dict[str, RunStatus] = {
    "orchestration.run.submit.accepted": RunStatus.PENDING,
    "orchestration.run.started": RunStatus.RUNNING,
    "orchestration.run.succeeded": RunStatus.SUCCEEDED,
    "orchestration.run.failed": RunStatus.FAILED,
    "orchestration.run.cancelled": RunStatus.CANCELLED,
}
_STEP_EVENT_TO_STATUS: dict[str, StepStatus] = {
    "orchestration.step.started": StepStatus.RUNNING,
    "orchestration.step.succeeded": StepStatus.SUCCEEDED,
    "orchestration.step.failed": StepStatus.FAILED,
    "orchestration.step.cancelled": StepStatus.CANCELLED,
    "orchestration.step.skipped": StepStatus.SKIPPED,
}
_TERMINAL_RUN_STATUSES = {RunStatus.SUCCEEDED, RunStatus.FAILED, RunStatus.CANCELLED}
_TERMINAL_STEP_STATUSES = {
    StepStatus.SUCCEEDED,
    StepStatus.FAILED,
    StepStatus.CANCELLED,
    StepStatus.SKIPPED,
}
_RUN_ALLOWED_TRANSITIONS: dict[RunStatus, set[RunStatus]] = {
    RunStatus.PENDING: {RunStatus.RUNNING, RunStatus.FAILED, RunStatus.CANCELLED},
    RunStatus.RUNNING: {RunStatus.SUCCEEDED, RunStatus.FAILED, RunStatus.CANCELLED},
    RunStatus.SUCCEEDED: set(),
    RunStatus.FAILED: set(),
    RunStatus.CANCELLED: set(),
}
_STEP_ALLOWED_TRANSITIONS: dict[StepStatus, set[StepStatus]] = {
    StepStatus.RUNNING: _TERMINAL_STEP_STATUSES,
    StepStatus.SUCCEEDED: set(),
    StepStatus.FAILED: set(),
    StepStatus.CANCELLED: set(),
    StepStatus.SKIPPED: set(),
}


class WorkerStateMachineService:
    def __init__(self, run_repo: RunRepository, consumer_repo: ConsumerRepository) -> None:
        self._run_repo = run_repo
        self._consumer_repo = consumer_repo
        self._logger = logging.getLogger(__name__)

    async def process_message(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        consumer_name: str,
        message_id: str,
        run_id: str,
        event_type: str,
        correlation_id: str,
        causation_id: str | None,
        occurred_at: str,
        payload: dict[str, Any],
    ) -> dict[str, str]:
        duplicate = await self._consumer_repo.is_message_processed(
            stream_key=stream_key,
            consumer_group=consumer_group,
            message_id=message_id,
        )
        if duplicate:
            log_event(
                self._logger,
                level=logging.INFO,
                event="orchestration.worker.duplicate_message",
                run_id=run_id,
                message_id=message_id,
                event_type=event_type,
                correlation_id=correlation_id,
            )
            return {"decision": TransitionDecision.DUPLICATE.value, "run_id": run_id}

        decision = TransitionDecision.REJECTED
        reason_code: str | None = None
        reason_message: str | None = None
        step_id = self._extract_step_id(payload)

        if event_type in _RUN_EVENT_TO_STATUS:
            decision, reason_code, reason_message = await self._apply_run_transition(
                run_id=run_id,
                event_type=event_type,
                correlation_id=correlation_id,
                occurred_at=occurred_at,
                payload=payload,
            )
        elif event_type in _STEP_EVENT_TO_STATUS:
            decision, reason_code, reason_message = await self._apply_step_transition(
                run_id=run_id,
                event_type=event_type,
                step_id=step_id,
                occurred_at=occurred_at,
            )
        else:
            reason_code = "UNSUPPORTED_EVENT_TYPE"
            reason_message = f"Unsupported event type: {event_type}"

        await self._run_repo.append_timeline_entry(
            entry=RunTimelineEntry(
                id=new_uuid(),
                run_id=run_id,
                step_id=step_id,
                message_id=message_id,
                event_type=event_type,
                decision=decision,
                reason_code=reason_code,
                reason_message=reason_message,
                correlation_id=correlation_id,
                causation_id=causation_id,
                payload=payload,
                occurred_at=occurred_at,
                created_at=utc_now(),
            )
        )
        await self._consumer_repo.mark_message_processed_and_checkpoint(
            stream_key=stream_key,
            consumer_group=consumer_group,
            consumer_name=consumer_name,
            message_id=message_id,
            correlation_id=correlation_id,
            processed_at=utc_now(),
        )
        log_event(
            self._logger,
            level=logging.INFO,
            event="orchestration.worker.transition_applied",
            run_id=run_id,
            event_type=event_type,
            message_id=message_id,
            decision=decision.value,
            reason_code=reason_code,
            correlation_id=correlation_id,
            causation_id=causation_id,
        )

        return {
            "decision": decision.value,
            "run_id": run_id,
            "reason_code": reason_code or "",
            "reason_message": reason_message or "",
        }

    async def reconcile_startup(self, *, worker_instance: str, occurred_at: str) -> list[str]:
        in_flight_runs = await self._run_repo.list_in_flight_runs()
        reconciled: list[str] = []
        for run in in_flight_runs:
            await self._run_repo.append_timeline_entry(
                entry=RunTimelineEntry(
                    id=new_uuid(),
                    run_id=run.run_id,
                    step_id=run.current_step_id,
                    message_id=None,
                    event_type="orchestration.run.reconciled",
                    decision=TransitionDecision.ACCEPTED,
                    reason_code="WORKER_STARTUP_RECONCILIATION",
                    reason_message=f"Recovered by worker instance {worker_instance}",
                    correlation_id=run.correlation_id,
                    causation_id=None,
                    payload={"worker_instance": worker_instance, "status_before": run.status.value},
                    occurred_at=occurred_at,
                    created_at=utc_now(),
                )
            )
            reconciled.append(run.run_id)
        return reconciled

    async def _apply_run_transition(
        self,
        *,
        run_id: str,
        event_type: str,
        correlation_id: str,
        occurred_at: str,
        payload: dict[str, Any],
    ) -> tuple[TransitionDecision, str | None, str | None]:
        target_status = _RUN_EVENT_TO_STATUS[event_type]
        run = await self._run_repo.get_run(run_id=run_id)

        if run is None:
            if target_status != RunStatus.PENDING:
                return (
                    TransitionDecision.REJECTED,
                    "RUN_NOT_FOUND",
                    "Run must be created by orchestration.run.submit.accepted",
                )
            await self._run_repo.create_run(
                run=OrchestrationRun(
                    run_id=run_id,
                    status=RunStatus.PENDING,
                    correlation_id=correlation_id,
                    current_step_id=None,
                    last_event_type=event_type,
                    created_at=occurred_at,
                    updated_at=occurred_at,
                    run_type=self._extract_run_type(payload),
                    lease_owner=None,
                    lease_token=None,
                    last_heartbeat_at=None,
                    watchdog_timeout_at=self._default_timeout_at(occurred_at),
                    watchdog_attempt=0,
                    watchdog_state="NONE",
                    terminal_at=None,
                )
            )
            return TransitionDecision.ACCEPTED, None, None

        if target_status not in _RUN_ALLOWED_TRANSITIONS[run.status]:
            return (
                TransitionDecision.REJECTED,
                "ILLEGAL_RUN_TRANSITION",
                f"Cannot transition run from {run.status.value} to {target_status.value}",
            )

        await self._run_repo.update_run_status(
            run_id=run_id,
            status=target_status,
            current_step_id=run.current_step_id,
            last_event_type=event_type,
            updated_at=occurred_at,
            terminal_at=(occurred_at if target_status in _TERMINAL_RUN_STATUSES else None),
        )
        if target_status == RunStatus.RUNNING:
            await self._run_repo.compare_and_set_run_lease(
                run_id=run_id,
                expected_lease_token=run.lease_token,
                lease_owner=self._extract_lease_owner(payload),
                new_lease_token=self._extract_lease_token(payload),
                heartbeat_at=occurred_at,
                timeout_at=self._default_timeout_at(occurred_at),
                updated_at=occurred_at,
            )
        if target_status in _TERMINAL_RUN_STATUSES:
            await self._run_repo.compare_and_set_run_lease(
                run_id=run_id,
                expected_lease_token=run.lease_token,
                lease_owner=None,
                new_lease_token=None,
                heartbeat_at=None,
                timeout_at=run.watchdog_timeout_at,
                updated_at=occurred_at,
            )
        return TransitionDecision.ACCEPTED, None, None

    async def _apply_step_transition(
        self,
        *,
        run_id: str,
        event_type: str,
        step_id: str | None,
        occurred_at: str,
    ) -> tuple[TransitionDecision, str | None, str | None]:
        if not step_id:
            return (
                TransitionDecision.REJECTED,
                "STEP_ID_REQUIRED",
                "Step transition requires payload.step_id",
            )

        run = await self._run_repo.get_run(run_id=run_id)
        if run is None or run.status != RunStatus.RUNNING:
            return (
                TransitionDecision.REJECTED,
                "RUN_NOT_RUNNING",
                "Run must be RUNNING before step transitions",
            )

        target_status = _STEP_EVENT_TO_STATUS[event_type]
        step = await self._run_repo.get_step(run_id=run_id, step_id=step_id)
        if step is None:
            if target_status != StepStatus.RUNNING:
                return (
                    TransitionDecision.REJECTED,
                    "STEP_NOT_FOUND",
                    "Step must be created by orchestration.step.started",
                )
            await self._run_repo.create_step(
                step=OrchestrationStep(
                    step_id=step_id,
                    run_id=run_id,
                    status=StepStatus.RUNNING,
                    last_event_type=event_type,
                    created_at=occurred_at,
                    updated_at=occurred_at,
                    terminal_at=None,
                )
            )
            await self._run_repo.update_run_status(
                run_id=run_id,
                status=run.status,
                current_step_id=step_id,
                last_event_type=run.last_event_type,
                updated_at=occurred_at,
                terminal_at=run.terminal_at,
            )
            return TransitionDecision.ACCEPTED, None, None

        if target_status not in _STEP_ALLOWED_TRANSITIONS[step.status]:
            return (
                TransitionDecision.REJECTED,
                "ILLEGAL_STEP_TRANSITION",
                f"Cannot transition step from {step.status.value} to {target_status.value}",
            )

        await self._run_repo.update_step_status(
            run_id=run_id,
            step_id=step_id,
            status=target_status,
            last_event_type=event_type,
            updated_at=occurred_at,
            terminal_at=(occurred_at if target_status in _TERMINAL_STEP_STATUSES else None),
        )
        next_step_id = run.current_step_id
        if next_step_id == step_id and target_status in _TERMINAL_STEP_STATUSES:
            next_step_id = None
        await self._run_repo.update_run_status(
            run_id=run_id,
            status=run.status,
            current_step_id=next_step_id,
            last_event_type=run.last_event_type,
            updated_at=occurred_at,
            terminal_at=run.terminal_at,
        )
        return TransitionDecision.ACCEPTED, None, None

    def _extract_step_id(self, payload: dict[str, Any]) -> str | None:
        raw = payload.get("step_id")
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
        return None

    def _extract_run_type(self, payload: dict[str, Any]) -> str:
        raw = payload.get("run_type")
        if isinstance(raw, str) and raw.strip():
            return raw.strip().upper()
        return "DEFAULT"

    def _extract_lease_owner(self, payload: dict[str, Any]) -> str:
        for key in ("lease_owner", "worker_instance", "worker_id"):
            raw = payload.get(key)
            if isinstance(raw, str) and raw.strip():
                return raw.strip()
        return "worker-unknown"

    def _extract_lease_token(self, payload: dict[str, Any]) -> str:
        raw = payload.get("lease_token")
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
        return new_uuid()

    def _default_timeout_at(self, occurred_at: str) -> str:
        base = datetime.fromisoformat(occurred_at.replace("Z", "+00:00")).astimezone(UTC)
        return (
            (base + timedelta(seconds=settings.orchestration_watchdog_default_timeout_seconds))
            .isoformat()
            .replace(
                "+00:00",
                "Z",
            )
        )
