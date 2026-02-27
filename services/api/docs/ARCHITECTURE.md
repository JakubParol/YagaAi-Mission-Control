# API Architecture — Mission Control v1

**Status:** Draft v1.1
**Date:** 2026-02-27
**Applies to:** `services/api`

---

## 1) Design Principles

This architecture follows the [workspace coding standards](../../../.openclaw/standards/coding-standards.md):

- **Package by feature** — top-level directories are domain modules, not technical layers
- **Clean Architecture** — layers inside each module: api → application ← infrastructure; domain has zero external dependencies
- **Port/Adapter pattern** — application defines interfaces (ports), infrastructure implements them
- **Async-first** — async endpoints, async DB driver
- **Constructor injection** — services receive dependencies via constructor, wired through FastAPI `Depends()`

---

## 2) Modules

The API is a single FastAPI service with multiple domain modules:

| Module | Prefix | Domain |
|---|---|---|
| **planning** | `/v1/planning` | Projects, epics, stories, tasks, backlogs, assignments, labels |
| **observability** | `/v1/observability` | Agent status, LLM costs, requests, Langfuse import |

More modules will be added over time. Each module is self-contained and follows the same internal structure.

---

## 3) High-Level Layout

```
services/api/
├── app/
│   ├── main.py                  # FastAPI app factory, middleware, lifespan
│   ├── config.py                # pydantic-settings (env-driven)
│   │
│   ├── shared/                  # Cross-module shared code
│   │   ├── api/                 # Response envelope, error handlers, common deps
│   │   │   ├── deps.py          # DB session, actor identity, common Depends()
│   │   │   ├── envelope.py      # Envelope[T], ListMeta, ErrorResponse
│   │   │   ├── errors.py        # AppError hierarchy + exception handlers
│   │   │   └── health.py        # GET /healthz (unversioned)
│   │   └── db.py                # Async engine, session factory
│   │
│   ├── planning/                # Module: /v1/planning/...
│   │   ├── api/                 # Routers + request/response DTOs
│   │   │   ├── router.py        # Aggregates sub-routers for this module
│   │   │   ├── schemas.py       # Pydantic models (CreateProject, UpdateTask, etc.)
│   │   │   ├── projects.py      # CRUD routes
│   │   │   ├── epics.py
│   │   │   ├── stories.py
│   │   │   ├── tasks.py
│   │   │   ├── backlogs.py
│   │   │   ├── assignments.py
│   │   │   └── labels.py
│   │   ├── application/         # Use cases, orchestration, ports
│   │   │   ├── ports.py         # ABC interfaces (ProjectRepo, TaskRepo, etc.)
│   │   │   ├── project_service.py
│   │   │   ├── epic_service.py
│   │   │   ├── story_service.py
│   │   │   ├── task_service.py
│   │   │   ├── backlog_service.py
│   │   │   └── label_service.py
│   │   ├── domain/              # Entities, value objects, invariants
│   │   │   └── models.py        # Status enums, business rules
│   │   └── infrastructure/      # Port implementations
│   │       └── repository.py    # Async SQL queries
│   │
│   └── observability/           # Module: /v1/observability/...
│       ├── api/
│       │   ├── router.py
│       │   ├── schemas.py
│       │   ├── agents.py
│       │   ├── costs.py
│       │   ├── requests.py
│       │   └── imports.py
│       ├── application/
│       │   ├── ports.py
│       │   ├── agent_service.py
│       │   ├── cost_service.py
│       │   └── import_service.py
│       ├── domain/
│       │   └── models.py
│       └── infrastructure/
│           ├── repository.py
│           └── langfuse_client.py  # External API adapter
│
├── tests/
│   ├── planning/
│   └── observability/
├── docs/
└── pyproject.toml
```

---

## 4) Layers (within each module)

| Layer | Responsibility | Imports from |
|---|---|---|
| **api/** | HTTP handling, request validation, response shaping | application, shared/api |
| **application/** | Business logic, orchestration, transaction boundaries | domain, ports (own interfaces) |
| **domain/** | Entities, value objects, enums, invariants | nothing (standalone) |
| **infrastructure/** | Port implementations, SQL, external HTTP calls | application/ports, shared/db |

Rules:
- **api** never imports **infrastructure** or **domain** directly — always through **application**.
- **application** defines ports (ABCs); **infrastructure** implements them.
- **domain** has zero imports from other layers or external packages.
- Cross-module imports are forbidden. Shared code lives in `shared/`.

---

## 5) Dependency Injection

FastAPI `Depends()` is the wiring mechanism. Services use constructor injection.

```python
# planning/application/ports.py
from abc import ABC, abstractmethod

class TaskRepository(ABC):
    @abstractmethod
    async def get_by_id(self, task_id: UUID) -> Task | None: ...

# planning/application/task_service.py
class TaskService:
    def __init__(self, repo: TaskRepository) -> None:
        self._repo = repo

    async def get_task(self, task_id: UUID) -> Task:
        task = await self._repo.get_by_id(task_id)
        if not task:
            raise NotFoundError("Task", task_id)
        return task

# planning/api/tasks.py
async def get_task_service(db: AsyncSession = Depends(get_db)) -> TaskService:
    repo = SqlTaskRepository(db)
    return TaskService(repo)

@router.get("/{task_id}")
async def get_task(
    task_id: UUID,
    service: TaskService = Depends(get_task_service),
) -> Envelope[TaskResponse]:
    task = await service.get_task(task_id)
    return Envelope(data=TaskResponse.from_domain(task))
```

No global singletons for stateful objects. Composition happens at the edge (router-level `Depends`).

---

## 6) Configuration

```python
class Settings(BaseSettings):
    app_name: str = "mission-control-api"
    env: str = "dev"                    # dev | staging | prod
    log_level: str = "INFO"
    database_url: str = "sqlite+aiosqlite:///mc.db"
    allowed_origins: list[str] = ["*"]

    # Observability module
    langfuse_host: str = ""
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""

    model_config = SettingsConfigDict(env_prefix="MC_API_", env_file=".env")
```

All config from env vars prefixed `MC_API_`. No config files beyond `.env` for local dev.

---

## 7) API Versioning & Routing

- All module endpoints live under `/v1/{module}`.
- Health check (`/healthz`) stays at root (unversioned).
- Each module has its own `router.py` aggregating sub-routers.

```python
# app/main.py
from app.shared.api.health import health_router
from app.planning.api.router import planning_router
from app.observability.api.router import observability_router

app.include_router(health_router)
app.include_router(planning_router, prefix="/v1/planning")
app.include_router(observability_router, prefix="/v1/observability")
```

When v2 is needed, add v2 routers per module. Old versions stay until deprecated.

---

## 8) Middleware Stack (planned order)

1. **CORS** — `CORSMiddleware` (allow configured origins)
2. **Request ID** — inject `X-Request-Id` header (UUID) for tracing
3. **Logging** — structured request/response log (method, path, status, duration)
4. **Exception handlers** — registered via `app.exception_handler()`, not middleware

---

## Navigation

- ↑ [Docs Index](./INDEX.md)
- → [API Contracts](./API_CONTRACTS.md)
- → [Auth](./AUTH.md)
- → [Status Transitions](./STATUS_TRANSITIONS.md)
- → [Operational Notes](./OPERATIONAL.md)
