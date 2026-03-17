from pydantic import BaseModel, Field


class BacklogCreate(BaseModel):
    project_id: str | None = None
    name: str = Field(..., min_length=1, max_length=200)
    kind: str = Field(..., pattern=r"^(BACKLOG|SPRINT|IDEAS)$")
    goal: str | None = None
    start_date: str | None = None
    end_date: str | None = None


class BacklogUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    status: str | None = Field(None, pattern=r"^(OPEN|ACTIVE|CLOSED)$")
    rank: str | None = None
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


class BacklogKindTransitionRequest(BaseModel):
    kind: str = Field(..., pattern=r"^(BACKLOG|SPRINT|IDEAS)$")


# ---------------------------------------------------------------------------
# Item membership (unified)
# ---------------------------------------------------------------------------


class BacklogAddItem(BaseModel):
    work_item_id: str = Field(..., min_length=1)
    rank: str | None = None


class BacklogItemResponse(BaseModel):
    backlog_id: str
    work_item_id: str
    rank: str
    added_at: str


class BacklogItemRankUpdateRequest(BaseModel):
    rank: str = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# Active sprint
# ---------------------------------------------------------------------------


class ActiveSprintItemLabelResponse(BaseModel):
    id: str
    name: str
    color: str | None


class ActiveSprintItemResponse(BaseModel):
    id: str
    key: str | None
    title: str
    type: str
    sub_type: str | None
    status: str
    priority: int | None
    parent_id: str | None
    parent_key: str | None = None
    parent_title: str | None = None
    rank: str
    children_count: int = 0
    done_children_count: int = 0
    assignee_agent_id: str | None = None
    assignee_name: str | None = None
    assignee_last_name: str | None = None
    assignee_initials: str | None = None
    assignee_avatar: str | None = None
    labels: list[ActiveSprintItemLabelResponse] = Field(default_factory=list)
    label_ids: list[str] = Field(default_factory=list)


class ActiveSprintResponse(BaseModel):
    backlog: BacklogResponse
    items: list[ActiveSprintItemResponse]


# ---------------------------------------------------------------------------
# Sprint membership
# ---------------------------------------------------------------------------


class SprintMembershipRequest(BaseModel):
    work_item_id: str = Field(..., min_length=1)


class SprintMembershipResponse(BaseModel):
    work_item_id: str
    source_backlog_id: str
    target_backlog_id: str
    moved: bool


# ---------------------------------------------------------------------------
# Sprint completion
# ---------------------------------------------------------------------------


class SprintCompleteRequest(BaseModel):
    target_backlog_id: str = Field(..., min_length=1)
