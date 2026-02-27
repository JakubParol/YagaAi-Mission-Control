from dataclasses import dataclass, field


@dataclass
class AgentStatus:
    name: str
    role: str
    status: str
    task: str | None = None


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


@dataclass
class SupervisorTask:
    task_id: str
    objective: str
    worker_type: str
    state: str
    story_id: str
    inputs: list[dict] | None = None
    constraints: dict | None = None
    output_requirements: dict | None = None
    parse_error: str | None = None


@dataclass
class SupervisorStory:
    id: str
    content: str
    task_counts: dict[str, int] = field(default_factory=dict)


@dataclass
class ResultFile:
    name: str
    path: str
    content: str | None


@dataclass
class TaskResult:
    task_id: str
    files: list[ResultFile]
