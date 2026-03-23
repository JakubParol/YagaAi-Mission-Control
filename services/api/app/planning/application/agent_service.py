import json
import re
from typing import Any

from app.planning.application.ports import AgentRepository, OpenClawAgentSourcePort
from app.planning.domain.models import Agent, AgentSource
from app.shared.api.errors import NotFoundError, ValidationError
from app.shared.utils import new_uuid, utc_now

_INITIALS_RE = re.compile(r"^[A-Z]{1,10}$")
_NAME_PART_MAX_LEN = 200


class AgentService:
    def __init__(
        self,
        repo: AgentRepository,
        openclaw_source: OpenClawAgentSourcePort | None = None,
    ) -> None:
        self._repo = repo
        self._openclaw_source = openclaw_source

    async def list_agents(
        self,
        *,
        openclaw_key: str | None = None,
        is_active: bool | None = None,
        source: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str = "-created_at",
    ) -> tuple[list[Agent], int]:
        return await self._repo.list_all(
            openclaw_key=openclaw_key,
            is_active=is_active,
            source=source,
            limit=limit,
            offset=offset,
            sort=sort,
        )

    async def get_agent(self, agent_id: str) -> Agent:
        agent = await self._repo.get_by_id(agent_id)
        if not agent:
            raise NotFoundError(f"Agent {agent_id} not found")
        return agent

    async def create_agent(
        self,
        *,
        openclaw_key: str,
        name: str,
        last_name: str | None = None,
        initials: str | None = None,
        role: str | None = None,
        worker_type: str | None = None,
        avatar: str | None = None,
        is_active: bool = True,
        source: AgentSource = AgentSource.MANUAL,
        metadata_json: str | None = None,
    ) -> Agent:
        now = utc_now()
        agent = Agent(
            id=new_uuid(),
            openclaw_key=openclaw_key,
            name=name,
            last_name=last_name,
            initials=initials,
            role=role,
            worker_type=worker_type,
            avatar=avatar,
            is_active=is_active,
            source=source,
            main_session_key=None,
            metadata_json=metadata_json,
            last_synced_at=None,
            created_at=now,
            updated_at=now,
        )
        return await self._repo.create(agent)

    async def update_agent(self, agent_id: str, data: dict[str, Any]) -> Agent:
        existing = await self._repo.get_by_id(agent_id)
        if not existing:
            raise NotFoundError(f"Agent {agent_id} not found")

        data["updated_at"] = utc_now()
        updated = await self._repo.update(agent_id, data)
        if not updated:
            raise NotFoundError(f"Agent {agent_id} not found")
        return updated

    async def delete_agent(self, agent_id: str) -> None:
        existing = await self._repo.get_by_id(agent_id)
        if not existing:
            raise NotFoundError(f"Agent {agent_id} not found")
        await self._repo.delete(agent_id)

    async def sync_agents_from_openclaw(self) -> dict[str, int]:
        if self._openclaw_source is None:
            raise ValidationError("OpenClaw source is not configured")

        try:
            raw_agents = await self._openclaw_source.list_agents()
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc

        now = utc_now()
        summary = {
            "created": 0,
            "updated": 0,
            "deactivated": 0,
            "unchanged": 0,
            "errors": 0,
        }

        normalized_by_key: dict[str, dict[str, Any]] = {}
        for raw in raw_agents:
            try:
                normalized = self._normalize_sync_record(raw)
            except ValueError:
                summary["errors"] += 1
                continue

            key = normalized["openclaw_key"]
            if key in normalized_by_key:
                summary["errors"] += 1
                continue
            normalized_by_key[key] = normalized

        synced_keys = set(normalized_by_key.keys())

        for openclaw_key in sorted(normalized_by_key):
            normalized = normalized_by_key[openclaw_key]
            existing = await self._repo.get_by_openclaw_key(openclaw_key)
            if existing is None:
                created = Agent(
                    id=new_uuid(),
                    openclaw_key=openclaw_key,
                    name=normalized["name"],
                    last_name=normalized["last_name"],
                    initials=normalized["initials"],
                    role=normalized["role"],
                    worker_type=normalized["worker_type"],
                    avatar=normalized["avatar"],
                    is_active=normalized["is_active"],
                    source=AgentSource.OPENCLAW_JSON,
                    main_session_key=None,
                    metadata_json=normalized["metadata_json"],
                    last_synced_at=now,
                    created_at=now,
                    updated_at=now,
                )
                await self._repo.create(created)
                summary["created"] += 1
                continue

            changed = (
                existing.name != normalized["name"]
                or existing.last_name != normalized["last_name"]
                or existing.initials != normalized["initials"]
                or existing.role != normalized["role"]
                or existing.worker_type != normalized["worker_type"]
                or existing.avatar != normalized["avatar"]
                or existing.is_active != normalized["is_active"]
                or existing.metadata_json != normalized["metadata_json"]
                or existing.source != AgentSource.OPENCLAW_JSON
            )

            await self._repo.update(
                existing.id,
                {
                    "name": normalized["name"],
                    "last_name": normalized["last_name"],
                    "initials": normalized["initials"],
                    "role": normalized["role"],
                    "worker_type": normalized["worker_type"],
                    "avatar": normalized["avatar"],
                    "is_active": normalized["is_active"],
                    "metadata_json": normalized["metadata_json"],
                    "source": AgentSource.OPENCLAW_JSON,
                    "last_synced_at": now,
                    "updated_at": now,
                },
            )
            summary["updated" if changed else "unchanged"] += 1

        openclaw_agents = await self._repo.list_by_source(AgentSource.OPENCLAW_JSON)
        for agent in openclaw_agents:
            if agent.openclaw_key in synced_keys:
                continue

            if agent.is_active:
                await self._repo.update(
                    agent.id,
                    {
                        "is_active": False,
                        "last_synced_at": now,
                        "updated_at": now,
                    },
                )
                summary["deactivated"] += 1
            else:
                summary["unchanged"] += 1

        return summary

    @staticmethod
    def _normalize_sync_record(raw: dict[str, Any]) -> dict[str, Any]:
        openclaw_key = AgentService._first_non_empty_string(
            raw.get("key"), raw.get("name"), raw.get("id")
        )
        if openclaw_key is None:
            raise ValueError("Agent entry is missing key/name/id")

        name = AgentService._first_non_empty_string(raw.get("name"), openclaw_key) or openclaw_key
        last_name = AgentService._optional_last_name(
            raw.get("last_name"),
            raw.get("lastName"),
            raw.get("family_name"),
            raw.get("familyName"),
            raw.get("surname"),
        )
        initials = AgentService._optional_initials(raw.get("initials"))
        role = AgentService._optional_string(raw.get("role"))
        worker_type = AgentService._first_non_empty_string(
            raw.get("worker_type"),
            raw.get("workerType"),
            raw.get("type"),
        )
        avatar = AgentService._optional_string(raw.get("avatar"))
        active = AgentService._to_bool(raw.get("is_active"))
        if active is None:
            active = AgentService._to_bool(raw.get("active"))
        if active is None:
            active = True

        try:
            metadata_json = json.dumps(raw, sort_keys=True, separators=(",", ":"))
        except TypeError as exc:
            raise ValueError("Agent entry contains non-serializable fields") from exc

        return {
            "openclaw_key": openclaw_key,
            "name": name,
            "last_name": last_name,
            "initials": initials,
            "role": role,
            "worker_type": worker_type,
            "avatar": avatar,
            "is_active": active,
            "metadata_json": metadata_json,
        }

    @staticmethod
    def _first_non_empty_string(*values: Any) -> str | None:
        for value in values:
            text = AgentService._optional_string(value)
            if text:
                return text
        return None

    @staticmethod
    def _optional_string(value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return None

    @staticmethod
    def _optional_last_name(*values: Any) -> str | None:
        value = AgentService._first_non_empty_string(*values)
        if value is None:
            return None
        if len(value) > _NAME_PART_MAX_LEN:
            raise ValueError("last_name must be at most 200 characters")
        return value

    @staticmethod
    def _optional_initials(value: Any) -> str | None:
        text = AgentService._optional_string(value)
        if text is None:
            return None

        initials = text.upper()
        if len(initials) > 10:
            raise ValueError("initials must be at most 10 characters")
        if not _INITIALS_RE.fullmatch(initials):
            raise ValueError("initials must contain only letters A-Z")
        return initials

    @staticmethod
    def _to_bool(value: Any) -> bool | None:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"1", "true", "yes", "on"}:
                return True
            if lowered in {"0", "false", "no", "off"}:
                return False
        return None
