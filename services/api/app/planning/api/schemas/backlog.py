from pydantic import BaseModel, Field


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
