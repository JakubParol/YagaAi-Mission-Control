# AGENTS.md — Mission Control API

## What This Is

FastAPI REST service for Mission Control. Three domain modules: **planning** (work management), **observability** (LLM costs), and **workflow** (agent status, stories/tasks from filesystem).

## Scope

- **In scope:** REST API for planning (projects, epics, stories, tasks, backlogs, assignments, labels), observability (costs, requests, Langfuse import), and workflow (agent status, stories/tasks, board)
- **Out of scope:** Frontend UI (see `apps/web/`), CLI (see `apps/cli/`), auth enforcement (v2)

## Required Reading

Before making changes, read:

1. This file
2. [docs/INDEX.md](./docs/INDEX.md) — API documentation index

Domain context (read if unfamiliar):

3. [Entity Model v1](../../docs/ENTITY_MODEL_V1.md)
4. [Workflow Logic v1](../../docs/WORKFLOW_LOGIC_V1.md)

## Tech Decisions

| Decision | Rationale |
|---|---|
| Package by feature | Per workspace coding-standards — `planning/`, `observability/`, `workflow/` as top-level modules |
| Clean Architecture layers | api → application ← infrastructure, domain standalone |
| Port/Adapter pattern | Application defines ABCs, infrastructure implements |
| Async-first | Async endpoints, aiosqlite for DB access |
| Constructor injection | Services receive deps via constructor, wired through `Depends()` |
| pydantic-settings | Env-driven config with `MC_API_` prefix |

## Rules

- **Routers never import repositories** — always go through application services.
- **Application layer owns transaction boundaries** and defines ports (ABCs).
- **Domain has zero external dependencies** — pure models, enums, invariants.
- **Cross-module imports are forbidden** — shared code lives in `shared/`.
- **No cross-project imports** — API does not import from `apps/web/`.

## Navigation

- ↑ [Root AGENTS.md](../../AGENTS.md)
- → [README.md](./README.md)
- → [docs/INDEX.md](./docs/INDEX.md)
