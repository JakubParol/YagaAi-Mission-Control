from pydantic import BaseModel, Field


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
