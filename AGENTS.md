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

When asked to plan and implement a User Story, execute the FULL workflow end-to-end. Do NOT stop between steps unless there is a blocker that requires user intervention.

### Phase 1: Implementation

1. **Plan** — Prepare the implementation plan for the US.
2. **Create tasks** — Use `mc task create` to create tasks in the US based on the plan.
3. **Start the story** — Before starting the first task, set the story to IN_PROGRESS via `mc story update`.
4. **For each task:**
   - Set the task to IN_PROGRESS via `mc task update --id <uuid> --set status=IN_PROGRESS`
   - Implement and commit
   - Set the task to DONE via `mc task update --id <uuid> --set status=DONE`

### Phase 2: Pull Request

5. **Create PR** — After all tasks are DONE, create a PR to `main` using `gh pr create`. Set the story to CODE_REVIEW via `mc story update`.

### Phase 3: Code Review & Fix

6. **Self-review** — Run `/review-pr` on your own PR. Be thorough.
7. **Fix EVERYTHING** — Address ALL review findings, no matter how small (typos, naming, style, logic — everything). Commit and push fixes.
8. **Re-review** — Run `/review-pr` again. Fix any remaining findings and commit. Two review rounds max.

### Phase 4: Merge & Deploy

9. **Merge** — Squash-merge the PR via `gh pr merge --squash --delete-branch`.
10. **Update local** — `git checkout main && git pull`.
11. **Deploy** — Run `./infra/deploy.sh`.
12. **Close story** — Set the story to DONE via `mc story update`.

### Blocker Protocol

- If ANY step fails with an error you cannot resolve autonomously (deploy failure, merge conflict needing user input, test failure with unclear cause, etc.) — STOP, report the blocker clearly, and wait for user input.
- Do NOT stop for routine issues you can fix yourself (lint errors, failing tests with obvious cause, review findings, etc.).


## Autonomous Mode

If your prompt contains the marker `[AUTONOMOUS_STEP]`, you are running as a one-shot executor inside an automated pipeline. In this mode:
- **IGNORE "Task Workflow"** — the pipeline manages the workflow
- **IGNORE "Planning Operations"** — do NOT call `mc` CLI
- **IGNORE "Startup Report"** — do NOT report what you read
- Focus ONLY on the specific task described in your prompt
- Read project docs for context (drill-down is still useful), but do NOT execute any workflow steps beyond what your prompt asks

## Navigation

- → [README.md](./README.md)
- → [docs/INDEX.md](./docs/INDEX.md)
- → [docs/REPO_MAP.md](./docs/REPO_MAP.md)
