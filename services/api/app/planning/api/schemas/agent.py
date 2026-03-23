from pydantic import BaseModel, Field, field_validator

from app.planning.api.schemas._validators import (
    normalize_avatar,
    normalize_initials,
    normalize_optional_name_part,
)


class AgentCreate(BaseModel):
    openclaw_key: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=200)
    last_name: str | None = None
    initials: str | None = None
    role: str | None = None
    worker_type: str | None = None
    avatar: str | None = None
    is_active: bool = True
    source: str = Field("manual", pattern=r"^(openclaw_json|manual)$")
    main_session_key: str | None = None
    metadata_json: str | None = None

    @field_validator("avatar")
    @classmethod
    def validate_avatar(cls, value: str | None) -> str | None:
        return normalize_avatar(value)

    @field_validator("last_name")
    @classmethod
    def validate_last_name(cls, value: str | None) -> str | None:
        return normalize_optional_name_part(value, field_name="last_name")

    @field_validator("initials")
    @classmethod
    def validate_initials(cls, value: str | None) -> str | None:
        return normalize_initials(value)


class AgentUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    last_name: str | None = None
    initials: str | None = None
    role: str | None = None
    worker_type: str | None = None
    avatar: str | None = None
    is_active: bool | None = None
    source: str | None = Field(None, pattern=r"^(openclaw_json|manual)$")
    main_session_key: str | None = None
    metadata_json: str | None = None

    @field_validator("avatar")
    @classmethod
    def validate_avatar(cls, value: str | None) -> str | None:
        return normalize_avatar(value)

    @field_validator("last_name")
    @classmethod
    def validate_last_name(cls, value: str | None) -> str | None:
        return normalize_optional_name_part(value, field_name="last_name")

    @field_validator("initials")
    @classmethod
    def validate_initials(cls, value: str | None) -> str | None:
        return normalize_initials(value)


class AgentResponse(BaseModel):
    id: str
    openclaw_key: str
    name: str
    last_name: str | None
    initials: str | None
    role: str | None
    worker_type: str | None
    avatar: str | None
    is_active: bool
    source: str
    main_session_key: str | None
    metadata_json: str | None
    last_synced_at: str | None
    created_at: str
    updated_at: str


class AgentSyncResponse(BaseModel):
    created: int
    updated: int
    deactivated: int
    unchanged: int
    errors: int
