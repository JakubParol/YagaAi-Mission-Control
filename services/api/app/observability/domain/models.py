from dataclasses import dataclass


@dataclass
class DailyMetric:
    date: str
    model: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    request_count: int
    total_cost: float


@dataclass
class ImportRecord:
    id: int
    started_at: str
    finished_at: str | None
    mode: str
    from_timestamp: str | None
    to_timestamp: str
    status: str
    error_message: str | None = None


@dataclass
class LangfuseRequest:
    id: str
    trace_id: str | None
    name: str | None
    model: str | None
    started_at: str | None
    finished_at: str | None
    input_tokens: int
    output_tokens: int
    total_tokens: int
    cost: float | None
    latency_ms: int | None


@dataclass
class PaginatedRequests:
    data: list[LangfuseRequest]
    total: int
