from dataclasses import dataclass
from enum import StrEnum


class ProjectStatus(StrEnum):
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"


class BacklogKind(StrEnum):
    BACKLOG = "BACKLOG"
    SPRINT = "SPRINT"
    IDEAS = "IDEAS"


class BacklogStatus(StrEnum):
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"


class AgentSource(StrEnum):
    OPENCLAW_JSON = "openclaw_json"
    MANUAL = "manual"


@dataclass
class Project:
    id: str
    key: str
    name: str
    description: str | None
    status: str
    created_by: str | None
    updated_by: str | None
    created_at: str
    updated_at: str


@dataclass
class Agent:
    id: str
    openclaw_key: str
    name: str
    role: str | None
    worker_type: str | None
    is_active: bool
    source: str
    metadata_json: str | None
    last_synced_at: str | None
    created_at: str
    updated_at: str


@dataclass
class Label:
    id: str
    project_id: str | None
    name: str
    color: str | None
    created_at: str


@dataclass
class Backlog:
    id: str
    project_id: str | None
    name: str
    kind: str
    status: str
    is_default: bool
    goal: str | None
    start_date: str | None
    end_date: str | None
    metadata_json: str | None
    created_by: str | None
    updated_by: str | None
    created_at: str
    updated_at: str
