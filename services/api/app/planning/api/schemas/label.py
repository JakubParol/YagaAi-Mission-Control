from pydantic import BaseModel, Field


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
