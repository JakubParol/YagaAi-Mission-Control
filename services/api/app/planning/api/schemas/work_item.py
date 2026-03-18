from typing import Any

from pydantic import BaseModel, Field

_STATUS_PATTERN = r"^(TODO|IN_PROGRESS|CODE_REVIEW|VERIFY|DONE)$"
_TYPE_PATTERN = r"^(EPIC|STORY|TASK|BUG)$"


class WorkItemCreate(BaseModel):
    type: str = Field(..., pattern=_TYPE_PATTERN)
    title: str = Field(..., min_length=1, max_length=500)
    project_id: str | None = None
    parent_id: str | None = None
    sub_type: str | None = Field(None, max_length=50)
    summary: str | None = None
    description: str | None = None
    priority: int | None = None
    estimate_points: float | None = None
    due_at: str | None = None
    current_assignee_agent_id: str | None = None


class WorkItemUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    summary: str | None = None
    description: str | None = None
    sub_type: str | None = Field(None, max_length=50)
    status: str | None = Field(None, pattern=_STATUS_PATTERN)
    parent_id: str | None = None
    is_blocked: bool | None = None
    blocked_reason: str | None = None
    priority: int | None = None
    estimate_points: float | None = None
    due_at: str | None = None
    current_assignee_agent_id: str | None = None
    metadata_json: str | None = None


class WorkItemResponse(BaseModel):
    id: str
    type: str
    project_id: str | None
    parent_id: str | None
    key: str | None
    title: str
    sub_type: str | None
    summary: str | None
    description: str | None
    status: str
    status_mode: str
    status_override: str | None
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
    parent_key: str | None = None
    parent_title: str | None = None
    children_count: int = 0
    done_children_count: int = 0
    labels: list[dict[str, Any]] = Field(default_factory=list)
    label_ids: list[str] = Field(default_factory=list)


class WorkItemDetailResponse(WorkItemResponse):
    assignments: list["WorkItemAssignmentResponse"] = Field(default_factory=list)


class WorkItemOverviewResponse(BaseModel):
    work_item_key: str
    title: str
    type: str
    status: str
    progress_pct: float
    progress_trend_7d: float
    children_total: int
    children_done: int
    children_in_progress: int
    blocked_count: int
    stale_days: int
    priority: int | None
    updated_at: str


class WorkItemStatusChangeRequest(BaseModel):
    status: str = Field(..., pattern=_STATUS_PATTERN)


class WorkItemStatusChangeResponse(BaseModel):
    work_item_id: str
    from_status: str
    to_status: str
    changed: bool
    actor_id: str | None
    timestamp: str


class WorkItemAssignAgentRequest(BaseModel):
    agent_id: str = Field(..., min_length=1)


class WorkItemAssignmentResponse(BaseModel):
    id: str
    work_item_id: str
    agent_id: str
    assigned_at: str
    unassigned_at: str | None
    assigned_by: str | None
    reason: str | None


class WorkItemAttachLabelRequest(BaseModel):
    label_id: str = Field(..., min_length=1)
