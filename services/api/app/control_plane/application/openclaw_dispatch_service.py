import logging
from dataclasses import asdict, dataclass

from app.control_plane.application.ports import (
    AgentQueueRepository,
    DispatchRecordRepository,
    OpenClawDispatchPort,
)
from app.control_plane.domain.models import (
    DISPATCH_CONTRACT_VERSION,
    AgentQueueEntry,
    AgentQueueStatus,
    DispatchEnvelope,
    DispatchRecord,
    DispatchRecordStatus,
)
from app.shared.logging import log_event
from app.shared.utils import new_uuid, utc_now

logger = logging.getLogger(__name__)


@dataclass
class ExternalDispatchResult:
    action: str  # "sent" | "failed" | "missing_session_key"
    dispatch_record: DispatchRecord | None = None
    error: str | None = None


class OpenClawDispatchService:
    """Builds and sends a dispatch envelope to an agent's main session.

    Agent-agnostic: dispatch target is resolved by the caller via
    assigned_agent_id → agent.main_session_key. This service handles
    the external send, metadata persistence, and failure recording.
    """

    def __init__(
        self,
        *,
        queue_repo: AgentQueueRepository,
        dispatch_repo: DispatchRecordRepository,
        openclaw_adapter: OpenClawDispatchPort,
    ) -> None:
        self._queue_repo = queue_repo
        self._dispatch_repo = dispatch_repo
        self._adapter = openclaw_adapter

    async def dispatch_to_openclaw(
        self,
        *,
        entry: AgentQueueEntry,
        openclaw_key: str,
        main_session_key: str | None,
    ) -> ExternalDispatchResult:
        """Send a claimed queue entry to the agent's main session.

        Precondition: entry.status must already be ACK_PENDING.
        On failure, reverts to QUEUED for retry.
        """
        if not main_session_key:
            return await self._handle_missing_session_key(entry=entry)

        run_id = f"cp-{entry.agent_id}-run-{new_uuid()[:12]}"
        now = utc_now()
        envelope = self._build_envelope(
            entry=entry,
            run_id=run_id,
            openclaw_key=openclaw_key,
            main_session_key=main_session_key,
        )
        record = self._build_record(
            entry=entry,
            run_id=run_id,
            envelope=envelope,
            dispatch_session_key=main_session_key,
            now=now,
        )

        try:
            session_meta = await self._adapter.send_dispatch(envelope=envelope)
        except (RuntimeError, OSError, ValueError) as exc:
            return await self._handle_failure(
                entry=entry,
                record=record,
                error=str(exc),
                now=now,
            )

        record.status = DispatchRecordStatus.SENT
        record.session_id = session_meta.session_id
        record.process_id = session_meta.process_id
        record.dispatched_at = now

        await self._dispatch_repo.create(record=record)
        await self._dispatch_repo.commit()

        log_event(
            logger,
            level=logging.INFO,
            event="control_plane.dispatch.sent",
            agent_id=entry.agent_id,
            run_id=run_id,
            work_item_key=entry.work_item_key,
            main_session_key=main_session_key,
            process_id=session_meta.process_id,
            correlation_id=entry.correlation_id,
        )

        return ExternalDispatchResult(action="sent", dispatch_record=record)

    @staticmethod
    def _build_envelope(
        *,
        entry: AgentQueueEntry,
        run_id: str,
        openclaw_key: str,
        main_session_key: str,
    ) -> DispatchEnvelope:
        project_key = entry.work_item_key.split("-")[0] if "-" in entry.work_item_key else ""
        prompt_marker = f"[{entry.work_item_key}] [E2E]"
        repo_root = entry.project_repo_root

        return DispatchEnvelope(
            run_id=run_id,
            correlation_id=entry.correlation_id,
            causation_id=f"agent.assignment.dispatched:{entry.id}",
            agent_id=entry.agent_id,
            openclaw_key=openclaw_key,
            main_session_key=main_session_key,
            work_item_id=entry.work_item_id,
            work_item_key=entry.work_item_key,
            work_item_title=entry.work_item_title,
            project_key=project_key,
            repo_root=repo_root,
            work_dir=repo_root,
            prompt_marker=prompt_marker,
            contract_version=DISPATCH_CONTRACT_VERSION,
        )

    @staticmethod
    def _build_record(
        *,
        entry: AgentQueueEntry,
        run_id: str,
        envelope: DispatchEnvelope,
        dispatch_session_key: str,
        now: str,
    ) -> DispatchRecord:
        return DispatchRecord(
            id=new_uuid(),
            queue_entry_id=entry.id,
            run_id=run_id,
            agent_id=entry.agent_id,
            work_item_id=entry.work_item_id,
            work_item_key=entry.work_item_key,
            status=DispatchRecordStatus.FAILED,
            envelope_json=asdict(envelope),
            dispatch_session_key=dispatch_session_key,
            created_at=now,
        )

    async def record_dispatch_failure(
        self,
        *,
        entry: AgentQueueEntry,
        reason_code: str,
    ) -> ExternalDispatchResult:
        """Record a dispatch failure and revert queue entry to QUEUED.

        Use for pre-send failures (agent not found, missing session key, etc.)
        where the adapter was never called.
        """
        now = utc_now()
        error = f"{reason_code} for agent '{entry.agent_id}'"

        record = DispatchRecord(
            id=new_uuid(),
            queue_entry_id=entry.id,
            run_id=f"cp-{entry.agent_id}-run-{new_uuid()[:12]}",
            agent_id=entry.agent_id,
            work_item_id=entry.work_item_id,
            work_item_key=entry.work_item_key,
            status=DispatchRecordStatus.FAILED,
            envelope_json={},
            error_message=error,
            created_at=now,
        )
        await self._dispatch_repo.create(record=record)

        await self._queue_repo.transition_status(
            entry_id=entry.id,
            expected_status=AgentQueueStatus.ACK_PENDING,
            new_status=AgentQueueStatus.QUEUED,
            updated_at=now,
        )
        await self._dispatch_repo.commit()
        await self._queue_repo.commit()

        log_event(
            logger,
            level=logging.ERROR,
            event="control_plane.dispatch.pre_send_failure",
            agent_id=entry.agent_id,
            reason_code=reason_code,
            work_item_key=entry.work_item_key,
            correlation_id=entry.correlation_id,
        )

        return ExternalDispatchResult(
            action=reason_code.lower(),
            dispatch_record=record,
            error=error,
        )

    async def _handle_missing_session_key(
        self,
        *,
        entry: AgentQueueEntry,
    ) -> ExternalDispatchResult:
        return await self.record_dispatch_failure(
            entry=entry,
            reason_code="MISSING_MAIN_SESSION_KEY",
        )

    async def _handle_failure(
        self,
        *,
        entry: AgentQueueEntry,
        record: DispatchRecord,
        error: str,
        now: str,
    ) -> ExternalDispatchResult:
        record.status = DispatchRecordStatus.FAILED
        record.error_message = error

        await self._dispatch_repo.create(record=record)

        await self._queue_repo.transition_status(
            entry_id=entry.id,
            expected_status=AgentQueueStatus.ACK_PENDING,
            new_status=AgentQueueStatus.QUEUED,
            updated_at=now,
        )
        await self._dispatch_repo.commit()
        await self._queue_repo.commit()

        log_event(
            logger,
            level=logging.ERROR,
            event="control_plane.dispatch.failed",
            agent_id=entry.agent_id,
            run_id=record.run_id,
            work_item_key=entry.work_item_key,
            error=error,
            correlation_id=entry.correlation_id,
        )

        return ExternalDispatchResult(
            action="failed",
            dispatch_record=record,
            error=error,
        )
