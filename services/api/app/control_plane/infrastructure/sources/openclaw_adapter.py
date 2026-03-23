import asyncio
import logging

from app.control_plane.application.ports import OpenClawDispatchPort
from app.control_plane.domain.models import DispatchEnvelope, OpenClawSessionMetadata
from app.shared.logging import log_event

logger = logging.getLogger(__name__)

_QUICK_FAIL_SECONDS = 2


class SubprocessSessionDispatchAdapter(OpenClawDispatchPort):
    """Dispatches work to an agent's main session via `openclaw agent` CLI.

    Semantics: this is a session-dispatch, not a harness launch.
    MC sends a structured message to the agent's main session.
    The agent decides how to execute (ACP, Claude Code, Codex, etc.).

    The subprocess is launched detached so it survives API process restarts.
    A quick-fail check catches immediate startup errors (bad binary, bad args).
    """

    def __init__(self, *, openclaw_binary: str = "openclaw") -> None:
        self._binary = openclaw_binary

    async def send_dispatch(
        self,
        *,
        envelope: DispatchEnvelope,
    ) -> OpenClawSessionMetadata:
        prompt = self._build_prompt(envelope)
        cmd = [
            self._binary,
            "agent",
            "--agent",
            envelope.openclaw_key,
            "--session-id",
            envelope.main_session_key,
            "--message",
            prompt,
            "--json",
            "--timeout",
            "3600",
        ]

        log_event(
            logger,
            level=logging.INFO,
            event="control_plane.dispatch.adapter.launching",
            agent_id=envelope.agent_id,
            openclaw_key=envelope.openclaw_key,
            main_session_key=envelope.main_session_key,
            run_id=envelope.run_id,
            work_item_key=envelope.work_item_key,
        )

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
                start_new_session=True,
            )
        except (OSError, FileNotFoundError) as exc:
            msg = f"Failed to launch openclaw subprocess: {exc}"
            raise RuntimeError(msg) from exc

        # Quick-fail: if the process dies within the grace period, it failed
        try:
            await asyncio.wait_for(proc.wait(), timeout=_QUICK_FAIL_SECONDS)
            # Process exited within grace period — likely an error
            stderr_bytes = await proc.stderr.read() if proc.stderr else b""
            stderr_text = stderr_bytes.decode("utf-8", errors="replace")[:500]
            msg = (
                f"openclaw agent exited immediately with code {proc.returncode}: " f"{stderr_text}"
            )
            raise RuntimeError(msg)
        except asyncio.TimeoutError:
            # Process is still running after grace period — dispatch is underway
            pass

        log_event(
            logger,
            level=logging.INFO,
            event="control_plane.dispatch.adapter.sent",
            agent_id=envelope.agent_id,
            run_id=envelope.run_id,
            pid=proc.pid,
            main_session_key=envelope.main_session_key,
        )

        return OpenClawSessionMetadata(
            session_id=envelope.main_session_key,
            process_id=proc.pid,
        )

    @staticmethod
    def _build_prompt(envelope: DispatchEnvelope) -> str:
        return (
            f"{envelope.prompt_marker} Implement only this story.\n"
            f"\n"
            f"Work item: {envelope.work_item_key} — {envelope.work_item_title}\n"
            f"Run ID: {envelope.run_id}\n"
            f"Correlation ID: {envelope.correlation_id}"
        )
