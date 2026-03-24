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
                stderr=asyncio.subprocess.DEVNULL,
                start_new_session=True,
            )
        except (OSError, FileNotFoundError) as exc:
            msg = f"Failed to launch openclaw subprocess: {exc}"
            raise RuntimeError(msg) from exc

        # Quick-fail check: only immediate non-zero exit is a startup error.
        # Exit code 0 = fast successful completion (agent accepted + returned).
        # Still running = long-running dispatch underway.
        try:
            await asyncio.wait_for(proc.wait(), timeout=_QUICK_FAIL_SECONDS)
            if proc.returncode != 0:
                msg = f"openclaw agent startup failure (exit code {proc.returncode})"
                raise RuntimeError(msg)
            # Exit 0 within grace period — fast success
            log_event(
                logger,
                level=logging.INFO,
                event="control_plane.dispatch.adapter.fast_success",
                agent_id=envelope.agent_id,
                run_id=envelope.run_id,
                pid=proc.pid,
            )
        except asyncio.TimeoutError:
            # Process is still running — dispatch underway (normal for long tasks)
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
            f"Repo root: {envelope.repo_root}\n"
            f"Work dir: {envelope.work_dir}\n"
            f"Contract: {envelope.contract_version}\n"
            f"Run ID: {envelope.run_id}\n"
            f"Correlation ID: {envelope.correlation_id}\n"
            f"\n"
            f"Report progress via runtime callbacks "
            f"(agent.assignment.accepted, agent.execution.spawned, etc.)."
        )
