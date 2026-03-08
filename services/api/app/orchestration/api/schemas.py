from typing import Any

from pydantic import BaseModel, Field


class CommandMetadata(BaseModel):
    producer: str = Field(..., min_length=1, max_length=100)
    correlation_id: str = Field(..., min_length=1, max_length=128)
    causation_id: str | None = Field(None, max_length=128)
    occurred_at: str = Field(..., min_length=1, max_length=64)


class SubmitCommandRequest(BaseModel):
    command_type: str = Field(..., min_length=5, max_length=120)
    schema_version: str = Field(..., min_length=3, max_length=20)
    payload: dict[str, Any]
    metadata: CommandMetadata


class EnvelopePayload(BaseModel):
    id: str
    kind: str
    type: str
    schema_version: str
    occurred_at: str
    producer: str
    correlation_id: str
    causation_id: str | None
    payload: dict[str, Any]


class SubmitCommandResponse(BaseModel):
    status: str
    command: EnvelopePayload
    outbox_event: EnvelopePayload
