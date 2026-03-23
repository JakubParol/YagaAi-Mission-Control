import logging

from app.control_plane.application.dispatch_selection_service import (
    DispatchSelectionService,
)
from app.control_plane.application.openclaw_dispatch_service import (
    OpenClawDispatchService,
)
from app.control_plane.application.queue_ingress_service import (
    IngressResult,
    QueueIngressService,
)
from app.shared.logging import log_event
from app.shared.ports import AgentLookupPort

logger = logging.getLogger(__name__)


class QueueDispatchService:
    """Orchestrates enqueue + push-dispatch as a single operation.

    Both the HTTP /ingest endpoint and the Planning assignment hook
    use this service so dispatch logic lives in one place.
    """

    def __init__(
        self,
        *,
        ingress: QueueIngressService,
        selection: DispatchSelectionService,
        dispatch: OpenClawDispatchService,
        agent_lookup: AgentLookupPort,
    ) -> None:
        self._ingress = ingress
        self._selection = selection
        self._dispatch = dispatch
        self._agent_lookup = agent_lookup

    @property
    def ingress(self) -> QueueIngressService:
        return self._ingress

    @property
    def selection(self) -> DispatchSelectionService:
        return self._selection

    async def enqueue_and_dispatch(
        self,
        *,
        work_item_id: str,
        work_item_key: str,
        work_item_type: str,
        work_item_title: str = "",
        work_item_status: str,
        project_repo_root: str = "",
        agent_id: str | None,
        previous_agent_id: str | None,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> IngressResult:
        result = await self._ingress.handle_assignment_changed(
            work_item_id=work_item_id,
            work_item_key=work_item_key,
            work_item_type=work_item_type,
            work_item_title=work_item_title,
            work_item_status=work_item_status,
            project_repo_root=project_repo_root,
            agent_id=agent_id,
            previous_agent_id=previous_agent_id,
            correlation_id=correlation_id,
            causation_id=causation_id,
        )

        if result.action == "enqueued" and agent_id:
            await self._try_push_dispatch(agent_id=agent_id)

        return result

    async def manual_dispatch(self, *, agent_id: str) -> dict:
        """Manual re-drive / testing path for POST /dispatch."""
        selection = await self._selection.try_dispatch_next(agent_id=agent_id)
        if selection.action != "dispatched" or selection.entry is None:
            return {"action": selection.action, "reason": selection.reason}

        agent_info = await self._agent_lookup.get_agent_by_id(selection.entry.agent_id)
        if agent_info is None:
            return {"action": "failed", "reason": "agent_not_found"}

        send_result = await self._dispatch.dispatch_to_openclaw(
            entry=selection.entry,
            openclaw_key=agent_info.openclaw_key,
            main_session_key=agent_info.main_session_key,
        )

        action = "dispatched" if send_result.action == "sent" else send_result.action
        return {
            "action": action,
            "entry": selection.entry,
            "dispatch_record": send_result.dispatch_record,
            "reason": send_result.error,
        }

    async def _try_push_dispatch(self, *, agent_id: str) -> None:
        """Best-effort push dispatch — does not propagate errors."""
        try:
            selection = await self._selection.try_dispatch_next(agent_id=agent_id)
            if selection.action != "dispatched" or selection.entry is None:
                return

            agent_info = await self._agent_lookup.get_agent_by_id(
                selection.entry.agent_id,
            )
            if agent_info is None:
                log_event(
                    logger,
                    level=logging.WARNING,
                    event="control_plane.push_dispatch.agent_not_found",
                    agent_id=agent_id,
                )
                return

            await self._dispatch.dispatch_to_openclaw(
                entry=selection.entry,
                openclaw_key=agent_info.openclaw_key,
                main_session_key=agent_info.main_session_key,
            )
        except Exception as exc:  # pylint: disable=broad-exception-caught
            log_event(
                logger,
                level=logging.WARNING,
                event="control_plane.push_dispatch.failed",
                agent_id=agent_id,
                error=str(exc),
            )
