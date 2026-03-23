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


class WatchdogSweepRequest(BaseModel):
    watchdog_instance: str = Field(..., min_length=1, max_length=100)
    evaluated_at: str = Field(..., min_length=1, max_length=64)


class WatchdogSweepResponse(BaseModel):
    status: str
    decisions: list[dict[str, str]]


class RunStateResponse(BaseModel):
    run_id: str
    status: str
    correlation_id: str
    causation_id: str | None
    current_step_id: str | None
    last_event_type: str
    run_type: str
    lease_owner: str | None
    lease_token: str | None
    last_heartbeat_at: str | None
    watchdog_timeout_at: str | None
    watchdog_attempt: int
    watchdog_state: str
    terminal_at: str | None
    created_at: str
    updated_at: str


class TimelineEntryResponse(BaseModel):
    id: str
    run_id: str
    run_status: str
    step_id: str | None
    message_id: str | None
    event_type: str
    decision: str
    reason_code: str | None
    reason_message: str | None
    correlation_id: str
    causation_id: str | None
    payload: dict[str, Any]
    occurred_at: str
    created_at: str
    is_watchdog_action: bool
    watchdog_action: str | None


class RunAttemptResponse(BaseModel):
    outbox_event_id: str
    command_id: str
    run_id: str
    event_type: str
    occurred_at: str
    status: str
    retry_attempt: int
    max_attempts: int
    next_retry_at: str | None
    dead_lettered_at: str | None
    last_error: str | None
    correlation_id: str
    causation_id: str | None


class ControlPlaneHealthMetricsResponse(BaseModel):
    queue_pending: int
    queue_oldest_pending_age_seconds: int | None
    retries_total: int
    dead_letter_total: int
    watchdog_interventions: int
    run_latency_avg_ms: float | None
    run_latency_p95_ms: float | None
    generated_at: str


# --- Naomi queue ingress ---


class QueueIngressRequest(BaseModel):
    work_item_id: str = Field(..., min_length=1)
    work_item_key: str = Field(..., min_length=1)
    work_item_type: str = Field(..., min_length=1)
    work_item_status: str = Field(..., min_length=1)
    agent_id: str | None = Field(None)
    previous_agent_id: str | None = Field(None)
    agent_openclaw_key: str | None = Field(None)
    previous_agent_openclaw_key: str | None = Field(None)
    correlation_id: str | None = Field(None)
    causation_id: str | None = Field(None)


class QueueIngressResponse(BaseModel):
    action: str
    queue_entry_id: str | None = None
    reason: str | None = None


class NaomiQueueEntryResponse(BaseModel):
    id: str
    work_item_id: str
    work_item_key: str
    work_item_type: str
    agent_id: str
    status: str
    queue_position: int
    correlation_id: str
    causation_id: str | None
    enqueued_at: str
    updated_at: str
    cancelled_at: str | None
