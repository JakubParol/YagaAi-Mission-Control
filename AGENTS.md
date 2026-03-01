# AGENTS.md — Mission Control

## What This Is

Mission Control is a monorepo for managing AI agent workflows. It contains a web dashboard, a REST API, and a CLI.

## Scope

- **In scope:** Dashboard UI, REST API (planning + observability modules), CLI, SQLite persistence, Langfuse integration
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
| CLI | TypeScript, Commander.js |
| Database | SQLite (aiosqlite for API, better-sqlite3 for frontend) |
| External | Langfuse (LLM observability) |

## Rules

- **Follow workspace standards.** [coding-standards.md](/home/kuba/.openclaw/standards/coding-standards.md) and [documentation.md](/home/kuba/.openclaw/standards/documentation.md) apply everywhere.
- **Package by feature.** Group by domain concept, not by technical layer.
- **Async-first.** API endpoints, DB access, and external IO are async.
- **No cross-project imports.** Apps and services do not import from each other.

# Planning Operations

When the user asks you to work with planning entities (projects, epics, stories, tasks, backlogs, agents, labels, etc.) — creating, updating, querying, or reviewing them:

1. **Use `mc` CLI only.** Do NOT use direct SQL queries or raw API calls. The CLI handles key generation, UUIDs, validation, and all business logic. The `mc` command is deployed and available in PATH.
2. **Discover commands with `--help`.** Use `mc --help`, `mc story --help`, `mc story create --help`, etc. to learn available commands, options, and required fields.
4. **Use `--output json`** when you need to parse responses programmatically. Default is table output for human reading.
5. **Common patterns:**
   - List: `mc story list --project-key MC --sort priority`
   - Get: `mc story get --key MC-47 --output json`
   - Create: `mc story create --json '{"title":"...","story_type":"USER_STORY","project_id":"..."}'`
   - Update: `mc task update --id <uuid> --set status=IN_PROGRESS`
   - Filter: `--key`, `--project-id`, `--story-id`, `--status`, `--sort`

## Task Workflow

When asked to plan and implement a User Story:

1. **Plan** — Prepare the implementation plan for the US.
2. **Create tasks** — Use `mc task create` to create tasks in the US based on the plan.
3. **Start the story** — Before starting the first task, set the story to IN_PROGRESS via `mc story update`.
4. **For each task:**
   - Set the task to IN_PROGRESS via `mc task update --id <uuid> --set status=IN_PROGRESS`
   - Implement and commit
   - Set the task to DONE via `mc task update --id <uuid> --set status=DONE`
5. **Finish** — After all tasks are DONE, set the story to CODE_REVIEW via `mc story update`.


## Navigation

- → [README.md](./README.md)
- → [docs/INDEX.md](./docs/INDEX.md)
- → [docs/REPO_MAP.md](./docs/REPO_MAP.md)
