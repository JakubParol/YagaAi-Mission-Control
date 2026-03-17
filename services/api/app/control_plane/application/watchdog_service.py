from __future__ import annotations

import logging
from datetime import UTC, datetime

from app.config import settings
from app.control_plane.application.ports import RunRepository
from app.control_plane.domain.models import (
    ControlPlaneRun,
    RunStatus,
    RunTimelineEntry,
    TransitionDecision,
    WatchdogAction,
)
from app.shared.logging import log_event
from app.shared.utils import new_uuid, utc_now


def _parse_iso8601(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


class WatchdogService:
    def __init__(self, repo: RunRepository) -> None:
        self._repo = repo
        self._logger = logging.getLogger(__name__)

    async def evaluate_stale_runs(
        self, *, watchdog_instance: str, evaluated_at: str
    ) -> list[dict[str, str]]:
        runs = await self._repo.list_in_flight_runs()
        decisions: list[dict[str, str]] = []
        now_dt = _parse_iso8601(evaluated_at)
        for run in runs:
            reason_code = self._detect_reason(run=run, now_dt=now_dt)
            if reason_code is None:
                continue
            action = self._choose_action(run=run, reason_code=reason_code)
            updated = await self._repo.apply_watchdog_action_if_lease_matches(
                run_id=run.run_id,
                expected_lease_token=run.lease_token,
                next_status=self._next_status(action=action),
                current_step_id=None if action != WatchdogAction.FAIL else run.current_step_id,
                last_event_type=f"control-plane.watchdog.{action.value.lower()}",
                updated_at=evaluated_at,
                terminal_at=(
                    evaluated_at
                    if action in (WatchdogAction.FAIL, WatchdogAction.QUARANTINE)
                    else None
                ),
                watchdog_attempt=run.watchdog_attempt + 1,
                watchdog_state=self._watchdog_state(action=action),
                clear_lease=True,
            )
            if not updated:
                await self._append_watchdog_timeline(
                    run=run,
                    action=action,
                    reason_code="WATCHDOG_CAS_CONFLICT",
                    reason_message="Lease token changed before watchdog mutation",
                    decision=TransitionDecision.REJECTED,
                    watchdog_instance=watchdog_instance,
                    occurred_at=evaluated_at,
                )
                decisions.append(
                    {
                        "run_id": run.run_id,
                        "decision": TransitionDecision.REJECTED.value,
                        "reason_code": "WATCHDOG_CAS_CONFLICT",
                    }
                )
                log_event(
                    self._logger,
                    level=logging.WARNING,
                    event="control-plane.watchdog.cas_conflict",
                    run_id=run.run_id,
                    action=action.value,
                    reason_code="WATCHDOG_CAS_CONFLICT",
                    correlation_id=run.correlation_id,
                    watchdog_instance=watchdog_instance,
                )
                continue

            await self._append_watchdog_timeline(
                run=run,
                action=action,
                reason_code=reason_code,
                reason_message=f"Watchdog applied {action.value}",
                decision=TransitionDecision.ACCEPTED,
                watchdog_instance=watchdog_instance,
                occurred_at=evaluated_at,
            )
            decisions.append(
                {
                    "run_id": run.run_id,
                    "decision": TransitionDecision.ACCEPTED.value,
                    "action": action.value,
                    "reason_code": reason_code,
                }
            )
            log_event(
                self._logger,
                level=logging.WARNING,
                event="control-plane.watchdog.action_applied",
                run_id=run.run_id,
                action=action.value,
                reason_code=reason_code,
                correlation_id=run.correlation_id,
                watchdog_instance=watchdog_instance,
            )
        return decisions

    def _detect_reason(self, *, run: ControlPlaneRun, now_dt: datetime) -> str | None:
        if run.status != RunStatus.RUNNING:
            return None
        if not run.lease_owner or not run.lease_token:
            return "STALE_LEASE"
        if run.last_heartbeat_at:
            heartbeat_age = (now_dt - _parse_iso8601(run.last_heartbeat_at)).total_seconds()
            if heartbeat_age > settings.control_plane_watchdog_heartbeat_grace_seconds:
                return "HEARTBEAT_LOSS"
        if run.watchdog_timeout_at:
            timeout_at = _parse_iso8601(run.watchdog_timeout_at)
            if now_dt >= timeout_at:
                return "RUN_TIMEOUT"
        return None

    def _choose_action(self, *, run: ControlPlaneRun, reason_code: str) -> WatchdogAction:
        run_type = run.run_type.upper()
        if run_type in {"CRITICAL", "USER_FLOW"}:
            return WatchdogAction.FAIL
        if run_type in {"BATCH", "ASYNC_PIPELINE"}:
            if run.watchdog_attempt >= 1:
                return WatchdogAction.QUARANTINE
            return WatchdogAction.RETRY
        if reason_code == "RUN_TIMEOUT":
            return WatchdogAction.FAIL
        return WatchdogAction.RETRY

    def _next_status(self, *, action: WatchdogAction) -> RunStatus:
        if action == WatchdogAction.RETRY:
            return RunStatus.PENDING
        return RunStatus.FAILED

    def _watchdog_state(self, *, action: WatchdogAction) -> str:
        if action == WatchdogAction.RETRY:
            return "RETRY_SCHEDULED"
        if action == WatchdogAction.QUARANTINE:
            return "QUARANTINED"
        return "FAILED_BY_WATCHDOG"

    async def _append_watchdog_timeline(
        self,
        *,
        run: ControlPlaneRun,
        action: WatchdogAction,
        reason_code: str,
        reason_message: str,
        decision: TransitionDecision,
        watchdog_instance: str,
        occurred_at: str,
    ) -> None:
        await self._repo.append_timeline_entry(
            entry=RunTimelineEntry(
                id=new_uuid(),
                run_id=run.run_id,
                step_id=run.current_step_id,
                message_id=None,
                event_type="control-plane.watchdog.action",
                decision=decision,
                reason_code=reason_code,
                reason_message=reason_message,
                correlation_id=run.correlation_id,
                causation_id=None,
                payload={
                    "watchdog_instance": watchdog_instance,
                    "action": action.value,
                    "run_type": run.run_type,
                    "watchdog_attempt_before": run.watchdog_attempt,
                    "recorded_at": utc_now(),
                },
                occurred_at=occurred_at,
                created_at=utc_now(),
            )
        )
