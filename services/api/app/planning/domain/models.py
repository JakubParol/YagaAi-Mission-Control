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
    OPEN = "OPEN"
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"


class WorkItemType(StrEnum):
    EPIC = "EPIC"
    STORY = "STORY"
    TASK = "TASK"
    BUG = "BUG"


class WorkItemStatus(StrEnum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    CODE_REVIEW = "CODE_REVIEW"
    VERIFY = "VERIFY"
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
    is_default: bool
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
    last_name: str | None
    initials: str | None
    role: str | None
    worker_type: str | None
    avatar: str | None
    is_active: bool
    source: AgentSource
    main_session_key: str | None
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
    rank: str
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
class WorkItem:
    id: str
    project_id: str | None
    parent_id: str | None
    key: str | None
    type: WorkItemType
    sub_type: str | None
    title: str
    summary: str | None
    description: str | None
    status: WorkItemStatus
    status_mode: StatusMode
    status_override: str | None
    status_override_set_at: str | None
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
class BacklogItem:
    backlog_id: str
    work_item_id: str
    rank: str
    added_at: str


@dataclass
class WorkItemAssignment:
    id: str
    work_item_id: str
    agent_id: str
    assigned_at: str
    unassigned_at: str | None
    assigned_by: str | None
    reason: str | None


@dataclass
class WorkItemOverview:
    work_item_id: str
    work_item_key: str
    title: str
    type: WorkItemType
    status: WorkItemStatus
    progress_pct: float
    progress_trend_7d: float
    children_total: int
    children_done: int
    children_in_progress: int
    blocked_count: int
    stale_days: int
    priority: int | None
    updated_at: str
