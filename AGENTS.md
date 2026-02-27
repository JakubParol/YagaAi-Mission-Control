# AGENTS.md — Mission Control

## What This Is

Mission Control is a monorepo for managing AI agent workflows. It contains a web dashboard, a REST API, and a CLI (planned).

## Scope

- **In scope:** Dashboard UI, REST API (planning + observability modules), CLI (planned), SQLite persistence, Langfuse integration, Supervisor System filesystem reads
- **Out of scope:** Authentication enforcement (v2), real-time WebSocket events (v2), multi-tenancy (v2)

## Required Reading (Mandatory)

Before making any changes, read **all** of the following:

1. This file
2. [Workspace coding standards](/home/kuba/.openclaw/standards/coding-standards.md)
3. [Workspace documentation standard](/home/kuba/.openclaw/standards/documentation.md)
4. [docs/INDEX.md](./docs/INDEX.md) — documentation index (includes mandatory link to Repo Map)

## Drill-Down Rule

The documents above give you the full repo context. When working on a **specific project**, drill down:

1. Read the project's `AGENTS.md` (e.g. `services/api/AGENTS.md`)
2. Read its mandatory references (if any)
3. Read the project's `docs/INDEX.md`
4. From there, read what's relevant to the task at hand

Use [docs/REPO_MAP.md](./docs/REPO_MAP.md) to find project paths and their entry points.

## Startup Report

At the start of every session, **report which documents you read** before proceeding. Format:

```
Read on startup:
- /AGENTS.md
- standards/coding-standards.md
- standards/documentation.md
- docs/INDEX.md
- docs/REPO_MAP.md
```

If you then drill into a project, report that too.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind CSS v4, shadcn/ui |
| API | FastAPI, Python 3.12, async, pydantic |
| CLI | Planned |
| Database | SQLite (aiosqlite for API, better-sqlite3 for frontend) |
| External | Langfuse (LLM observability), Supervisor System (filesystem) |

## Rules

- **Follow workspace standards.** [coding-standards.md](/home/kuba/.openclaw/standards/coding-standards.md) and [documentation.md](/home/kuba/.openclaw/standards/documentation.md) apply everywhere.
- **Package by feature.** Group by domain concept, not by technical layer.
- **Async-first.** API endpoints, DB access, and external IO are async.
- **No cross-project imports.** Apps and services do not import from each other.

## Navigation

- → [README.md](./README.md)
- → [docs/INDEX.md](./docs/INDEX.md)
- → [docs/REPO_MAP.md](./docs/REPO_MAP.md)
