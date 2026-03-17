from pydantic import BaseModel, Field


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
    current_assignee_agent_id: str | None = None


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
