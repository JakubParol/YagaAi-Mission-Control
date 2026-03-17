from pydantic import BaseModel, Field


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
