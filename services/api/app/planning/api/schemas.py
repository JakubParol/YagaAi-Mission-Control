from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------


class ProjectCreate(BaseModel):
    key: str = Field(..., min_length=1, max_length=10, pattern=r"^[A-Z][A-Z0-9]*$")
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    status: str | None = Field(None, pattern=r"^(ACTIVE|ARCHIVED)$")


class ProjectResponse(BaseModel):
    id: str
    key: str
    name: str
    description: str | None
    status: str
    created_by: str | None
    updated_by: str | None
    created_at: str
    updated_at: str


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
