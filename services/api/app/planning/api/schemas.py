from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------


class ProjectCreate(BaseModel):
    key: str = Field(..., min_length=1, max_length=10, pattern=r"^[A-Z][A-Z0-9]*$")
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    repo_root: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    status: str | None = Field(None, pattern=r"^(ACTIVE|ARCHIVED)$")
    repo_root: str | None = None


class ProjectResponse(BaseModel):
    id: str
    key: str
    name: str
    description: str | None
    status: str
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


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------


class AgentCreate(BaseModel):
    openclaw_key: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=200)
    role: str | None = None
    worker_type: str | None = None
    is_active: bool = True
    source: str = Field("manual", pattern=r"^(openclaw_json|manual)$")
    metadata_json: str | None = None


class AgentUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    role: str | None = None
    worker_type: str | None = None
    is_active: bool | None = None
    source: str | None = Field(None, pattern=r"^(openclaw_json|manual)$")
    metadata_json: str | None = None


class AgentResponse(BaseModel):
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


# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------


class LabelCreate(BaseModel):
    project_id: str | None = None
    name: str = Field(..., min_length=1, max_length=100)
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
    goal: str | None = None
    start_date: str | None = None
    end_date: str | None = None


class BacklogUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    status: str | None = Field(None, pattern=r"^(ACTIVE|CLOSED)$")
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
    position: int = Field(..., ge=0)


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


class SprintStoryResponse(BaseModel):
    id: str
    key: str | None
    title: str
    status: str
    priority: int | None
    story_type: str
    position: int


class ActiveSprintResponse(BaseModel):
    backlog: BacklogResponse
    stories: list[SprintStoryResponse]


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


class StoryUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    intent: str | None = None
    story_type: str | None = Field(None, min_length=1, max_length=50)
    status: str | None = Field(None, pattern=r"^(TODO|IN_PROGRESS|CODE_REVIEW|VERIFY|DONE)$")
    epic_id: str | None = None
    priority: int | None = None


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
