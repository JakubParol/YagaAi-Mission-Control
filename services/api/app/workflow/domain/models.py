from dataclasses import dataclass, field


@dataclass
class AgentStatus:
    name: str
    role: str
    status: str
    task: str | None = None


@dataclass
class WorkflowTask:
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
class WorkflowStory:
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
