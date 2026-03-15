import asyncio
import json
from pathlib import Path
from typing import Any

from app.planning.application.ports import OpenClawAgentSourcePort


class FileOpenClawAgentSource(OpenClawAgentSourcePort):
    def __init__(self, config_path: str) -> None:
        self._path = Path(config_path)

    async def list_agents(self) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._read_agents)

    def _read_agents(self) -> list[dict[str, Any]]:
        if not self._path.exists():
            raise ValueError(f"OpenClaw config not found: {self._path}")

        try:
            payload = json.loads(self._path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError(f"OpenClaw config is not valid JSON: {self._path}") from exc

        if not isinstance(payload, dict):
            raise ValueError("OpenClaw config root must be an object")

        agents_section = payload.get("agents")
        if not isinstance(agents_section, dict):
            raise ValueError("OpenClaw config must contain agents.list")

        raw_list = agents_section.get("list")
        if not isinstance(raw_list, list):
            raise ValueError("OpenClaw config agents.list must be an array")

        return [item for item in raw_list if isinstance(item, dict)]
