# AGENTS.md - Mission Control

## What This Is

Mission Control is a monorepo for managing AI agent workflows. It contains a web dashboard, a REST API, and a CLI.

## Scope

- **In scope:** Dashboard UI, REST API (planning + observability + orchestration modules), CLI, PostgreSQL persistence, Langfuse integration
- **Out of scope:** Authentication enforcement (v2), real-time WebSocket events (v2), multi-tenancy (v2)

## Required Reading (Mandatory)

Before making any changes, read **all** of the following:

1. This file
2. [Workspace coding standards](./docs/standards/coding-standards.md)
3. [Workspace documentation standard](./docs/standards/documentation.md)
4. [docs/INDEX.md](./docs/INDEX.md) - documentation index (includes mandatory link to Repo Map)

## Drill-Down Rule

The documents above give you the full repo context. When working on a **specific project**, drill down:

1. Read the project's `AGENTS.md` (e.g. `services/api/AGENTS.md`)
2. Read its mandatory references (if any)
3. Read the project's `docs/INDEX.md`
4. From there, read what's relevant to the task at hand

Use [docs/REPO_MAP.md](./docs/REPO_MAP.md) to find project paths and their entry points.

## Startup Report

At the start of every session, **report which documents you read** before proceeding. Format:

```text
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
| Frontend | Next.js 16, TypeScript, Tailwind CSS v4, shadcn/ui |
| API | FastAPI, Python 3.12, async, pydantic |
| CLI | TypeScript, Commander.js |
| Database | PostgreSQL |
| External | Langfuse (LLM observability) |

## Rules

- **Follow workspace standards.** [coding-standards.md](./docs/standards/coding-standards.md) and [documentation.md](./docs/standards/documentation.md) apply everywhere.

## Planning Operations

Use `mc` CLI for all planning entities (projects, epics, stories, tasks, backlogs, labels, agents). No direct DB or API mutations.

Full command reference, recipes, and placement rules: `/home/kuba/.openclaw/skills/mc-cli-router/SKILL.md`

## Task Workflow

When asked to deliver a US/task/bug end-to-end, use the delivery flow skill as the execution playbook:
- `.agents/skills/mission-control-delivery-flow/SKILL.md`

Quality bar is strict: fix issues at source, no hiding warnings unless explicitly approved by user.

## Autonomous Mode

If your prompt contains the marker `[AUTONOMOUS_STEP]`, you are running as a one-shot executor inside an automated pipeline. In this mode:
- **IGNORE "Task Workflow"** - the pipeline manages the workflow
- **IGNORE "Planning Operations"** - do NOT call `mc` CLI
- **IGNORE "Startup Report"** - do NOT report what you read
- Focus ONLY on the specific task described in your prompt
- Read project docs for context (drill-down is still useful), but do NOT execute any workflow steps beyond what your prompt asks

## Navigation

- [README.md](./README.md)
- [docs/INDEX.md](./docs/INDEX.md)
- [docs/REPO_MAP.md](./docs/REPO_MAP.md)
