import re
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator

_AVATAR_PATH_RE = re.compile(r"^(?:\.{1,2}/|/)?[A-Za-z0-9._~%-]+(?:/[A-Za-z0-9._~%-]+)*$")
_AVATAR_MAX_LEN = 1024
_NAME_MAX_LEN = 200
_INITIALS_MAX_LEN = 10
_INITIALS_RE = re.compile(r"^[A-Z]{1,10}$")


def _normalize_optional_name_part(
    value: str | None,
    *,
    field_name: str,
    max_length: int = _NAME_MAX_LEN,
) -> str | None:
    if value is None:
        return None

    text = value.strip()
    if text == "":
        return None

    if len(text) > max_length:
        raise ValueError(f"{field_name} must be at most {max_length} characters")
    return text


def _normalize_initials(value: str | None) -> str | None:
    normalized = _normalize_optional_name_part(
        value,
        field_name="initials",
        max_length=_INITIALS_MAX_LEN,
    )
    if normalized is None:
        return None

    initials = normalized.upper()
    if not _INITIALS_RE.fullmatch(initials):
        raise ValueError("initials must contain only letters A-Z")
    return initials


def _normalize_avatar(value: str | None) -> str | None:
    if value is None:
        return None

    avatar = value.strip()
    if avatar == "":
        return None

    if len(avatar) > _AVATAR_MAX_LEN:
        raise ValueError(f"avatar must be at most {_AVATAR_MAX_LEN} characters")

    if "://" in avatar:
        parsed = urlparse(avatar)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("avatar URL must use http/https and include a host")
        return avatar

    if not _AVATAR_PATH_RE.fullmatch(avatar):
        raise ValueError("avatar must be an http/https URL or a path-like value without spaces")
    return avatar


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------


class ProjectCreate(BaseModel):
    key: str = Field(..., min_length=1, max_length=10, pattern=r"^[A-Z][A-Z0-9]*$")
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    repo_root: str | None = None
    is_default: bool | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    status: str | None = Field(None, pattern=r"^(ACTIVE|ARCHIVED)$")
    repo_root: str | None = None
    is_default: bool | None = None


class ProjectResponse(BaseModel):
    id: str
    key: str
    name: str
    description: str | None
    status: str
    is_default: bool
    repo_root: str | None
    created_by: str | None
    updated_by: str | None
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# Epics
# ---------------------------------------------------------------------------


class EpicCreate(BaseModel):
    project_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    priority: int | None = None


class EpicUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    status: str | None = Field(None, pattern=r"^(TODO|IN_PROGRESS|DONE)$")
    priority: int | None = None


class EpicResponse(BaseModel):
    id: str
    project_id: str
    key: str
    title: str
    description: str | None
    status: str
    status_mode: str
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


class EpicDetailResponse(EpicResponse):
    story_count: int


class EpicOverviewResponse(BaseModel):
    epic_key: str
    title: str
    status: str
    progress_pct: float
    progress_trend_7d: float
    stories_total: int
    stories_done: int
    stories_in_progress: int
    blocked_count: int
    stale_days: int


class EpicStatusChangeRequest(BaseModel):
    status: str = Field(..., pattern=r"^(TODO|IN_PROGRESS|DONE)$")


class EpicStatusChangeResponse(BaseModel):
    epic_id: str
    from_status: str
    to_status: str
    changed: bool
    actor_id: str | None
    timestamp: str


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------


class AgentCreate(BaseModel):
    openclaw_key: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=200)
    last_name: str | None = None
    initials: str | None = None
    role: str | None = None
    worker_type: str | None = None
    avatar: str | None = None
    is_active: bool = True
    source: str = Field("manual", pattern=r"^(openclaw_json|manual)$")
    metadata_json: str | None = None

    @field_validator("avatar")
    @classmethod
    def validate_avatar(cls, value: str | None) -> str | None:
        return _normalize_avatar(value)

    @field_validator("last_name")
    @classmethod
    def validate_last_name(cls, value: str | None) -> str | None:
        return _normalize_optional_name_part(value, field_name="last_name")

    @field_validator("initials")
    @classmethod
    def validate_initials(cls, value: str | None) -> str | None:
        return _normalize_initials(value)


class AgentUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    last_name: str | None = None
    initials: str | None = None
    role: str | None = None
    worker_type: str | None = None
    avatar: str | None = None
    is_active: bool | None = None
    source: str | None = Field(None, pattern=r"^(openclaw_json|manual)$")
    metadata_json: str | None = None

    @field_validator("avatar")
    @classmethod
    def validate_avatar(cls, value: str | None) -> str | None:
        return _normalize_avatar(value)

    @field_validator("last_name")
    @classmethod
    def validate_last_name(cls, value: str | None) -> str | None:
        return _normalize_optional_name_part(value, field_name="last_name")

    @field_validator("initials")
    @classmethod
    def validate_initials(cls, value: str | None) -> str | None:
        return _normalize_initials(value)


class AgentResponse(BaseModel):
    id: str
    openclaw_key: str
    name: str
    last_name: str | None
    initials: str | None
    role: str | None
    worker_type: str | None
    avatar: str | None
    is_active: bool
    source: str
    metadata_json: str | None
    last_synced_at: str | None
    created_at: str
    updated_at: str


class AgentSyncResponse(BaseModel):
    created: int
    updated: int
    deactivated: int
    unchanged: int
    errors: int


# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------


class LabelCreate(BaseModel):
    project_id: str | None = None
    name: str = Field(..., min_length=1, max_length=100)
    color: str | None = Field(None, max_length=20)


class LabelUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    color: str | None = Field(None, max_length=20)


class LabelResponse(BaseModel):
    id: str
    project_id: str | None
    name: str
    color: str | None
    created_at: str


# ---------------------------------------------------------------------------
# Backlogs
# ---------------------------------------------------------------------------


class BacklogCreate(BaseModel):
    project_id: str | None = None
    name: str = Field(..., min_length=1, max_length=200)
    kind: str = Field(..., pattern=r"^(BACKLOG|SPRINT|IDEAS)$")
    display_order: int | None = Field(None, ge=0)
    goal: str | None = None
    start_date: str | None = None
    end_date: str | None = None


class BacklogUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    status: str | None = Field(None, pattern=r"^(OPEN|ACTIVE|CLOSED)$")
    display_order: int | None = Field(None, ge=0)
    goal: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    metadata_json: str | None = None


class BacklogResponse(BaseModel):
    id: str
    project_id: str | None
    name: str
    kind: str
    status: str
    display_order: int
    is_default: bool
    goal: str | None
    start_date: str | None
    end_date: str | None
    metadata_json: str | None
    created_by: str | None
    updated_by: str | None
    created_at: str
    updated_at: str


class BacklogAddStory(BaseModel):
    story_id: str = Field(..., min_length=1)
    position: int | None = Field(None, ge=0)


class BacklogAddTask(BaseModel):
    task_id: str = Field(..., min_length=1)
    position: int = Field(..., ge=0)


class BacklogStoryItemResponse(BaseModel):
    backlog_id: str
    story_id: str
    position: int
    added_at: str


class BacklogTaskItemResponse(BaseModel):
    backlog_id: str
    task_id: str
    position: int
    added_at: str


class BacklogReorderStoryItem(BaseModel):
    story_id: str = Field(..., min_length=1)
    position: int = Field(..., ge=0)


class BacklogReorderTaskItem(BaseModel):
    task_id: str = Field(..., min_length=1)
    position: int = Field(..., ge=0)


class BacklogReorderRequest(BaseModel):
    stories: list[BacklogReorderStoryItem] = Field(default_factory=list)
    tasks: list[BacklogReorderTaskItem] = Field(default_factory=list)


class BacklogReorderResponse(BaseModel):
    updated_story_count: int
    updated_task_count: int


class BacklogKindTransitionRequest(BaseModel):
    kind: str = Field(..., pattern=r"^(BACKLOG|SPRINT|IDEAS)$")


class SprintStoryLabelResponse(BaseModel):
    id: str
    name: str
    color: str | None


class SprintStoryResponse(BaseModel):
    id: str
    key: str | None
    title: str
    status: str
    priority: int | None
    story_type: str
    epic_key: str | None = None
    epic_title: str | None = None
    position: int
    task_count: int
    done_task_count: int
    assignee_agent_id: str | None = None
    assignee_name: str | None = None
    assignee_last_name: str | None = None
    assignee_initials: str | None = None
    assignee_avatar: str | None = None
    labels: list[SprintStoryLabelResponse] = Field(default_factory=list)
    label_ids: list[str] = Field(default_factory=list)


class ActiveSprintResponse(BaseModel):
    backlog: BacklogResponse
    stories: list[SprintStoryResponse]


class SprintMembershipMoveRequest(BaseModel):
    story_id: str = Field(..., min_length=1)
    position: int | None = Field(None, ge=0)


class SprintMembershipMoveResponse(BaseModel):
    story_id: str
    project_id: str
    source_backlog_id: str
    target_backlog_id: str
    source_position: int | None
    target_position: int | None
    moved: bool


class StoryBulkStatusUpdateRequest(BaseModel):
    story_ids: list[str] = Field(..., min_length=1)
    status: str = Field(..., pattern=r"^(TODO|IN_PROGRESS|CODE_REVIEW|VERIFY|DONE)$")


class SprintBulkMembershipRequest(BaseModel):
    story_ids: list[str] = Field(..., min_length=1)


class BulkOperationItemResult(BaseModel):
    entity_id: str
    success: bool
    timestamp: str
    error_code: str | None = None
    error_message: str | None = None


class BulkOperationResponse(BaseModel):
    operation: str
    total: int
    succeeded: int
    failed: int
    results: list[BulkOperationItemResult]


def to_bulk_operation_response(
    *,
    operation: str,
    total: int,
    succeeded: int,
    failed: int,
    results: list[BulkOperationItemResult],
) -> BulkOperationResponse:
    return BulkOperationResponse(
        operation=operation,
        total=total,
        succeeded=succeeded,
        failed=failed,
        results=results,
    )


# ---------------------------------------------------------------------------
# Stories
# ---------------------------------------------------------------------------


class StoryCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    story_type: str = Field(..., min_length=1, max_length=50)
    project_id: str | None = None
    epic_id: str | None = None
    intent: str | None = None
    description: str | None = None
    priority: int | None = None
    current_assignee_agent_id: str | None = None


class StoryUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    intent: str | None = None
    story_type: str | None = Field(None, min_length=1, max_length=50)
    status: str | None = Field(None, pattern=r"^(TODO|IN_PROGRESS|CODE_REVIEW|VERIFY|DONE)$")
    epic_id: str | None = None
    priority: int | None = None
    current_assignee_agent_id: str | None = None


class StoryResponse(BaseModel):
    id: str
    project_id: str | None
    epic_id: str | None
    key: str | None
    title: str
    intent: str | None
    description: str | None
    story_type: str
    status: str
    is_blocked: bool
    blocked_reason: str | None
    priority: int | None
    current_assignee_agent_id: str | None
    metadata_json: str | None
    created_by: str | None
    updated_by: str | None
    created_at: str
    updated_at: str
    started_at: str | None
    completed_at: str | None


class StoryDetailResponse(StoryResponse):
    task_count: int


class StoryAttachLabel(BaseModel):
    label_id: str = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    task_type: str = Field(..., min_length=1, max_length=50)
    project_id: str | None = None
    story_id: str | None = None
    objective: str | None = None
    priority: int | None = None
    estimate_points: float | None = None
    due_at: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    objective: str | None = None
    task_type: str | None = Field(None, min_length=1, max_length=50)
    status: str | None = Field(None, pattern=r"^(TODO|IN_PROGRESS|CODE_REVIEW|VERIFY|DONE)$")
    is_blocked: bool | None = None
    blocked_reason: str | None = None
    story_id: str | None = None
    priority: int | None = None
    estimate_points: float | None = None
    due_at: str | None = None


class TaskResponse(BaseModel):
    id: str
    project_id: str | None
    story_id: str | None
    key: str | None
    title: str
    objective: str | None
    task_type: str
    status: str
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


class TaskAssignmentResponse(BaseModel):
    id: str
    task_id: str
    agent_id: str
    assigned_at: str
    unassigned_at: str | None
    assigned_by: str | None
    reason: str | None


class TaskDetailResponse(TaskResponse):
    assignments: list[TaskAssignmentResponse]


class TaskAttachLabel(BaseModel):
    label_id: str = Field(..., min_length=1)


class TaskAssignAgent(BaseModel):
    agent_id: str = Field(..., min_length=1)
