import json
import logging
from dataclasses import asdict, dataclass

from app.control_plane.application.ports import (
    AgentQueueRepository,
    DispatchRecordRepository,
    OpenClawDispatchPort,
)
from app.control_plane.domain.models import (
    DISPATCH_CONTRACT_VERSION,
    DISPATCH_SUPPORTED_AGENTS,
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
    action: str  # "sent" | "failed" | "unsupported_agent"
    dispatch_record: DispatchRecord | None = None
    error: str | None = None


class OpenClawDispatchService:
    """Builds and sends a one-shot dispatch envelope to OpenClaw.

    Separated from DispatchSelectionService by design: selection/claim
    logic stays in the dispatch-selection layer, while this service
    handles the actual external send, metadata persistence, and failure
    recording.
    """

    def __init__(
        self,
        *,
        queue_repo: AgentQueueRepository,
        dispatch_repo: DispatchRecordRepository,
        openclaw_adapter: OpenClawDispatchPort,
        repo_root: str,
        contract_doc_path: str,
    ) -> None:
        self._queue_repo = queue_repo
        self._dispatch_repo = dispatch_repo
        self._adapter = openclaw_adapter
        self._repo_root = repo_root
        self._contract_doc_path = contract_doc_path

    async def dispatch_to_openclaw(
        self,
        *,
        entry: AgentQueueEntry,
    ) -> ExternalDispatchResult:
        """Send a claimed queue entry to OpenClaw via the adapter.

        Precondition: entry.status must already be ACK_PENDING
        (set by DispatchSelectionService). This service does NOT
        move queue status forward — it records the external send
        outcome and reverts to QUEUED on failure.
        """
        if entry.agent_id not in DISPATCH_SUPPORTED_AGENTS:
            return ExternalDispatchResult(
                action="unsupported_agent",
                error=f"Agent '{entry.agent_id}' not supported for v1 dispatch",
            )

        run_id = f"cp-{entry.agent_id}-run-{new_uuid()[:12]}"
        now = utc_now()
        envelope = self._build_envelope(entry=entry, run_id=run_id)
        record = self._build_record(
            entry=entry, run_id=run_id, envelope=envelope, now=now,
        )

        try:
            session_meta = await self._adapter.send_dispatch(envelope=envelope)
        except Exception as exc:
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
            event="control_plane.openclaw.dispatch.sent",
            agent_id=entry.agent_id,
            run_id=run_id,
            work_item_key=entry.work_item_key,
            session_id=session_meta.session_id,
            process_id=session_meta.process_id,
            correlation_id=entry.correlation_id,
        )

        return ExternalDispatchResult(action="sent", dispatch_record=record)

    def _build_envelope(
        self,
        *,
        entry: AgentQueueEntry,
        run_id: str,
    ) -> DispatchEnvelope:
        project_key = entry.work_item_key.split("-")[0] if "-" in entry.work_item_key else "MC"
        prompt_marker = f"[{entry.work_item_key}] [E2E]"

        return DispatchEnvelope(
            run_id=run_id,
            correlation_id=entry.correlation_id,
            causation_id=f"agent.assignment.dispatched:{entry.id}",
            agent_id=entry.agent_id,
            work_item_id=entry.work_item_id,
            work_item_key=entry.work_item_key,
            work_item_title=entry.work_item_title,
            project_key=project_key,
            repo_root=self._repo_root,
            work_dir=self._repo_root,
            prompt_marker=prompt_marker,
            contract_version=DISPATCH_CONTRACT_VERSION,
            contract_doc_path=self._contract_doc_path,
        )

    @staticmethod
    def _build_record(
        *,
        entry: AgentQueueEntry,
        run_id: str,
        envelope: DispatchEnvelope,
        now: str,
    ) -> DispatchRecord:
        return DispatchRecord(
            id=new_uuid(),
            queue_entry_id=entry.id,
            run_id=run_id,
            agent_id=entry.agent_id,
            work_item_id=entry.work_item_id,
            work_item_key=entry.work_item_key,
            status=DispatchRecordStatus.SENT,
            envelope_json=asdict(envelope),
            created_at=now,
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

        # Revert queue entry back to QUEUED so it can be retried
        reverted = await self._queue_repo.transition_status(
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
            event="control_plane.openclaw.dispatch.failed",
            agent_id=entry.agent_id,
            run_id=record.run_id,
            work_item_key=entry.work_item_key,
            error=error,
            reverted_to_queued=reverted,
            correlation_id=entry.correlation_id,
        )

        return ExternalDispatchResult(
            action="failed",
            dispatch_record=record,
            error=error,
        )
