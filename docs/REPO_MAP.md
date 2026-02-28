# Repository Map — Mission Control

Overview of all projects and components in this monorepo.

---

## Projects

| Project | Path | Type | Description |
|---|---|---|---|
| **Web** | `apps/web/` | Next.js 15 | Dashboard UI — LLM costs, planning views |
| **CLI** | `apps/cli/` | Planned | Command-line interface for Mission Control |
| **API** | `services/api/` | FastAPI (Python) | REST API — planning and observability modules |

---

## Web (`apps/web/`)

The Next.js application serving the Mission Control dashboard.

| Item | Detail |
|---|---|
| Entry point | `apps/web/src/app/` (App Router) |
| Domain types | `apps/web/src/lib/types.ts` |
| Langfuse import | `apps/web/src/lib/langfuse-import/` — imports LLM cost data from Langfuse |
| Planning schema | `apps/web/src/lib/planning/` — v1 DB schema, types, repository |
| API routes | `apps/web/src/app/api/` — Next.js API routes (dashboard data) |
| Database | `data/mission-control.db` (SQLite, shared) |
| Config | `apps/web/.env.local` — `LANGFUSE_*` |
| AGENTS.md | [`apps/web/AGENTS.md`](../apps/web/AGENTS.md) |

---

## CLI (`apps/cli/`)

TypeScript CLI (`mc`) built with Commander.js. Mirrors API resources as command groups.

| Item | Detail |
|---|---|
| Entry point | `apps/cli/src/index.ts` |
| Binary | `mc` (via `dist/index.js`) |
| Tech | TypeScript, Commander.js, native fetch |
| Config | Env vars `MC_API_BASE_URL`, `MC_ACTOR_ID`, `MC_ACTOR_TYPE`, `MC_OUTPUT`, `MC_TIMEOUT_SECONDS` |
| Lint | `apps/cli/scripts/lint.sh` (ESLint + TypeScript type-check) |
| AGENTS.md | [`apps/cli/AGENTS.md`](../apps/cli/AGENTS.md) |
| Docs | [`apps/cli/docs/INDEX.md`](../apps/cli/docs/INDEX.md) |

---

## API (`services/api/`)

FastAPI REST service with two domain modules:

| Module | Prefix | Domain |
|---|---|---|
| **planning** | `/v1/planning` | Projects, epics, stories, tasks, backlogs, assignments, labels |
| **observability** | `/v1/observability` | LLM costs, requests, Langfuse import |

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
| Langfuse | LLM observability (costs, traces) | HTTP API → imported to local SQLite |

---

## Navigation

- ↑ [Docs Index](./INDEX.md)
- ↑ [README.md](../README.md)
- ↑ [AGENTS.md](../AGENTS.md)
