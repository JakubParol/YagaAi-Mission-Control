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


class ItemStatus(StrEnum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    CODE_REVIEW = "CODE_REVIEW"
    VERIFY = "VERIFY"
    DONE = "DONE"


class EpicStatus(StrEnum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    DONE = "DONE"


class StatusMode(StrEnum):
    MANUAL = "MANUAL"
    DERIVED = "DERIVED"


class AgentSource(StrEnum):
    OPENCLAW_JSON = "openclaw_json"
    MANUAL = "manual"


@dataclass
class Project:
    id: str
    key: str
    name: str
    description: str | None
    status: ProjectStatus
    repo_root: str | None
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
    source: AgentSource
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
    kind: BacklogKind
    status: BacklogStatus
    is_default: bool
    goal: str | None
    start_date: str | None
    end_date: str | None
    metadata_json: str | None
    created_by: str | None
    updated_by: str | None
    created_at: str
    updated_at: str


@dataclass
class Epic:
    id: str
    project_id: str
    key: str
    title: str
    description: str | None
    status: EpicStatus
    status_mode: StatusMode
    status_override: str | None
    status_override_set_at: str | None
    is_blocked: bool
    blocked_reason: str | None
    priority: int | None
    metadata_json: str | None
    created_by: str | None
    updated_by: str | None
    created_at: str
    updated_at: str


@dataclass
class Story:
    id: str
    project_id: str | None
    epic_id: str | None
    key: str | None
    title: str
    intent: str | None
    description: str | None
    # story_type is intentionally a free-form string (no enum constraint).
    # Consumers may use values like USER_STORY, SPIKE, BUG, CHORE, etc.
    story_type: str
    status: ItemStatus
    status_mode: StatusMode
    status_override: str | None
    status_override_set_at: str | None
    is_blocked: bool
    blocked_reason: str | None
    priority: int | None
    metadata_json: str | None
    created_by: str | None
    updated_by: str | None
    created_at: str
    updated_at: str
    started_at: str | None
    completed_at: str | None


@dataclass
class BacklogStoryItem:
    backlog_id: str
    story_id: str
    position: int
    added_at: str


@dataclass
class BacklogTaskItem:
    backlog_id: str
    task_id: str
    position: int
    added_at: str


@dataclass
class Task:
    id: str
    project_id: str | None
    story_id: str | None
    key: str | None
    title: str
    objective: str | None
    task_type: str
    status: ItemStatus
    is_blocked: bool
    blocked_reason: str | None
    priority: int | None
    estimate_points: float | None
    due_at: str | None
    current_assignee_agent_id: str | None
    metadata_json: str | None
    created_by: str | None
    updated_by: str | None
    created_at: str
    updated_at: str
    started_at: str | None
    completed_at: str | None


@dataclass
class TaskAssignment:
    id: str
    task_id: str
    agent_id: str
    assigned_at: str
    unassigned_at: str | None
    assigned_by: str | None
    reason: str | None
