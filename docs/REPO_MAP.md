# Repository Map — Mission Control

Overview of all projects and components in this monorepo.

---

## Projects

| Project | Path | Type | Description |
|---|---|---|---|
| **Web** | `apps/web/` | Next.js 15 | Dashboard UI — agent monitoring, LLM costs, stories/tasks board |
| **CLI** | `apps/cli/` | Planned | Command-line interface for Mission Control |
| **API** | `services/api/` | FastAPI (Python) | REST API — planning and observability modules |

---

## Web (`apps/web/`)

The Next.js application serving the Mission Control dashboard.

| Item | Detail |
|---|---|
| Entry point | `apps/web/src/app/` (App Router) |
| Domain types | `apps/web/src/lib/types.ts` |
| Filesystem adapters | `apps/web/src/lib/adapters/` — reads Workflow System YAML/markdown |
| Langfuse import | `apps/web/src/lib/langfuse-import/` — imports LLM cost data from Langfuse |
| Planning schema | `apps/web/src/lib/planning/` — v1 DB schema, types, repository |
| API routes | `apps/web/src/app/api/` — Next.js API routes (dashboard data) |
| Database | `data/mission-control.db` (SQLite, shared) |
| Config | `apps/web/.env.local` — `WORKFLOW_SYSTEM_PATH`, `LANGFUSE_*` |
| AGENTS.md | [`apps/web/AGENTS.md`](../apps/web/AGENTS.md) |

---

## CLI (`apps/cli/`)

Planned. Not yet implemented.

| Item | Detail |
|---|---|
| AGENTS.md | [`apps/cli/AGENTS.md`](../apps/cli/AGENTS.md) |

---

## API (`services/api/`)

FastAPI REST service with three domain modules:

| Module | Prefix | Domain |
|---|---|---|
| **planning** | `/v1/planning` | Projects, epics, stories, tasks, backlogs, assignments, labels |
| **observability** | `/v1/observability` | LLM costs, requests, Langfuse import |
| **workflow** | `/v1/workflow` | Agent status, workflow stories/tasks, board (filesystem-based) |

| Item | Detail |
|---|---|
| Entry point | `services/api/app/main.py` |
| Architecture | Package-by-feature, Clean Architecture layers per module |
| Config | `services/api/app/config.py` — `MC_API_*` env vars |
| AGENTS.md | [`services/api/AGENTS.md`](../services/api/AGENTS.md) |
| Docs | [`services/api/docs/INDEX.md`](../services/api/docs/INDEX.md) |

---

## Shared

| Path | Purpose |
|---|---|
| `docs/` | Shared documentation (entity model, workflow logic, this file) |
| `data/` | SQLite database (gitignored) |
| `infra/` | Deployment configs (`mission-control.service`, `deploy.sh`) |

---

## External Dependencies

| System | Purpose | How accessed |
|---|---|---|
| Workflow System filesystem | Agent state, stories, tasks (YAML/markdown) | Read via `apps/web/src/lib/adapters/` at `WORKFLOW_SYSTEM_PATH` |
| Langfuse | LLM observability (costs, traces) | HTTP API → imported to local SQLite |

---

## Navigation

- ↑ [Docs Index](./INDEX.md)
- ↑ [README.md](../README.md)
- ↑ [AGENTS.md](../AGENTS.md)
