# API Architecture — Mission Control v1

**Status:** Draft v1.0
**Date:** 2026-02-27
**Applies to:** `services/api`

---

## 1) High-Level Layout

```
services/api/
├── app/
│   ├── main.py              # FastAPI app factory, middleware, lifespan
│   ├── config.py            # pydantic-settings (env-driven)
│   ├── deps.py              # Shared FastAPI dependencies (db session, current user, etc.)
│   ├── exceptions.py        # App-level exception classes + handlers
│   ├── api/
│   │   ├── health.py        # /healthz (exists)
│   │   └── v1/
│   │       ├── router.py    # Aggregates all v1 sub-routers under /v1
│   │       ├── projects.py
│   │       ├── epics.py
│   │       ├── stories.py
│   │       ├── tasks.py
│   │       ├── backlogs.py
│   │       ├── assignments.py
│   │       └── labels.py
│   ├── schemas/             # Pydantic request/response models
│   │   ├── common.py        # Envelope, pagination, error models
│   │   ├── projects.py
│   │   ├── epics.py
│   │   ├── stories.py
│   │   ├── tasks.py
│   │   ├── backlogs.py
│   │   ├── assignments.py
│   │   └── labels.py
│   ├── services/            # Business logic (status derivation, workflow rules)
│   │   ├── project_service.py
│   │   ├── epic_service.py
│   │   ├── story_service.py
│   │   ├── task_service.py
│   │   ├── backlog_service.py
│   │   └── label_service.py
│   ├── repositories/        # Data access (SQL queries, repository pattern)
│   │   └── ...              # One per aggregate root
│   └── models/              # SQLAlchemy / DB models (if ORM used) or raw SQL helpers
├── tests/
├── docs/
└── pyproject.toml
```

---

## 2) Layers

| Layer | Responsibility | Imports from |
|---|---|---|
| **api/** (routers) | HTTP handling, request validation, response shaping | schemas, services, deps |
| **schemas/** | Pydantic models for request/response contracts | (standalone) |
| **services/** | Business logic, workflow rules, status derivation | repositories, schemas |
| **repositories/** | Data access, SQL queries | models/db |
| **models/** | DB table definitions | (standalone) |
| **deps.py** | FastAPI `Depends()` providers | config, repositories |

Rules:
- Routers never import repositories directly — always go through services.
- Services own transaction boundaries.
- Repositories are stateless; they receive a db session via DI.

---

## 3) Dependency Injection

FastAPI's built-in `Depends()` is the only DI mechanism in v1.

```python
# deps.py
from app.config import settings

def get_db() -> Generator[Session, None, None]:
    """Yield a DB session, close on teardown."""
    ...

def get_current_user() -> str | None:
    """Extract caller identity from request (stub in v1)."""
    ...
```

Services are instantiated per-request in the router or provided via `Depends()` closures. No global singletons for stateful objects.

---

## 4) Configuration

Existing `app/config.py` uses `pydantic-settings`. Extend as needed:

```python
class Settings(BaseSettings):
    app_name: str = "mission-control-api"
    env: str = "dev"                   # dev | staging | prod
    log_level: str = "INFO"
    database_url: str = "sqlite:///mc.db"
    allowed_origins: list[str] = ["*"]  # CORS

    model_config = SettingsConfigDict(env_prefix="MC_API_", env_file=".env")
```

All config comes from env vars prefixed `MC_API_`. No config files beyond `.env` for local dev.

---

## 5) API Versioning & Routing

- All resource endpoints live under `/v1`.
- Health check (`/healthz`) stays at root (unversioned).
- Version prefix is applied via a single `APIRouter(prefix="/v1")` in `api/v1/router.py`.

```python
# app/api/v1/router.py
from fastapi import APIRouter
from app.api.v1 import projects, epics, stories, tasks, backlogs, assignments, labels

v1_router = APIRouter(prefix="/v1")
v1_router.include_router(projects.router)
v1_router.include_router(epics.router)
# ... etc.
```

```python
# app/main.py
app.include_router(health_router)
app.include_router(v1_router)
```

When v2 is needed, add `api/v2/` and a separate `v2_router`. Old versions stay until deprecated.

---

## 6) Middleware Stack (planned order)

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
