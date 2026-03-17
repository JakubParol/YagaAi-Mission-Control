from pydantic import BaseModel, Field


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
