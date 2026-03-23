import logging

import httpx

from app.control_plane.application.ports import OpenClawDispatchPort
from app.control_plane.domain.models import DispatchEnvelope, OpenClawSessionMetadata
from app.shared.logging import log_event

logger = logging.getLogger(__name__)

_DISPATCH_TIMEOUT_SECONDS = 30


class HttpOpenClawDispatchAdapter(OpenClawDispatchPort):
    """Sends one-shot dispatch requests to the OpenClaw Gateway via HTTP.

    v1 behaviour: Naomi-only. Posts a structured prompt to the gateway's
    ACP dispatch endpoint to start a one-shot session for the agent.
    """

    def __init__(
        self,
        *,
        gateway_base_url: str,
        gateway_token: str,
    ) -> None:
        self._base_url = gateway_base_url.rstrip("/")
        self._token = gateway_token

    async def send_dispatch(
        self,
        *,
        envelope: DispatchEnvelope,
    ) -> OpenClawSessionMetadata:
        prompt = self._build_prompt(envelope)
        payload = {
            "agentId": envelope.agent_id,
            "prompt": prompt,
            "mode": "one-shot",
            "metadata": {
                "run_id": envelope.run_id,
                "correlation_id": envelope.correlation_id,
                "causation_id": envelope.causation_id,
                "work_item_key": envelope.work_item_key,
                "contract_version": envelope.contract_version,
            },
            "cwd": envelope.work_dir,
        }

        log_event(
            logger,
            level=logging.INFO,
            event="control_plane.openclaw.adapter.sending",
            agent_id=envelope.agent_id,
            run_id=envelope.run_id,
            work_item_key=envelope.work_item_key,
        )

        async with httpx.AsyncClient(timeout=_DISPATCH_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{self._base_url}/api/acp/dispatch",
                json=payload,
                headers={
                    "Authorization": f"Bearer {self._token}",
                    "Content-Type": "application/json",
                    "X-Correlation-Id": envelope.correlation_id,
                },
            )

        if response.status_code >= 400:
            body_text = response.text[:500]
            msg = f"OpenClaw dispatch failed: HTTP {response.status_code} — {body_text}"
            raise RuntimeError(msg)

        data = response.json()
        session_id = data.get("sessionId") or data.get("session_id") or envelope.run_id

        return OpenClawSessionMetadata(
            session_id=str(session_id),
            process_id=data.get("processId") or data.get("process_id"),
            work_dir=data.get("cwd") or envelope.work_dir,
        )

    @staticmethod
    def _build_prompt(envelope: DispatchEnvelope) -> str:
        return (
            f"{envelope.prompt_marker} Implement only this story.\n"
            f"\n"
            f"Work item: {envelope.work_item_key} — {envelope.work_item_title}\n"
            f"Project: {envelope.project_key}\n"
            f"Repo root: {envelope.repo_root}\n"
            f"Contract: {envelope.contract_version}\n"
            f"Contract doc: {envelope.contract_doc_path}\n"
            f"Run ID: {envelope.run_id}\n"
            f"Correlation ID: {envelope.correlation_id}\n"
            f"\n"
            f"Read the contract doc before starting. Follow the E2E flow strictly."
        )
