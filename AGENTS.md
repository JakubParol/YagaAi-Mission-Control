# AGENTS.md — Mission Control

## What This Is

Mission Control is a read-only web dashboard for the Supervisor System. It reads stories, tasks, and results from the SUPERVISOR_SYSTEM filesystem and displays them in a navigable UI.

## Scope

- **In scope:** Read-only views of stories, tasks (by state), task details, results
- **Out of scope:** Write operations, authentication, database, websockets, worker management

## Required Reading

Before making changes, read:

1. This file
2. [README.md](./README.md) — project overview, setup, architecture
3. [docs/INDEX.md](./docs/INDEX.md) — documentation index
4. `src/lib/types.ts` — domain model
5. `src/lib/adapters/` — understand the read layer before adding features

## Tech Decisions

| Decision | Rationale |
|---|---|
| Server Components for data | Adapters use `fs` — must be server-only |
| `server-only` package | Enforces adapters never leak to client bundles |
| `js-yaml` for YAML parsing | Lightweight, widely used, handles task YAML well |
| No API routes for reads | Server Components can call adapters directly |
| `force-dynamic` on pages | Data comes from filesystem — must be fresh |
| Dark mode default | `<html className="dark">` — operator dashboard aesthetic |

## Rules

- **Adapters are the only filesystem interface.** No `fs` imports outside `src/lib/adapters/`.
- **Types are the contract.** UI components depend on types from `src/lib/types.ts`, not raw data shapes.
- **Server-only enforcement.** Every adapter file must `import "server-only"` at the top.
- **No write operations.** This is strictly read-only in v1.
- **Follow workspace standards.** See `standards/coding-standards.md` and `standards/documentation.md` in the parent workspace.

## Data Source

The app reads from the SUPERVISOR_SYSTEM filesystem:

```
SUPERVISOR_SYSTEM/
├── STORIES/<id>/
│   ├── STORY.md
│   ├── TASKS/{PLANNED,ASSIGNED,DONE,BLOCKED}/*.yaml
│   └── RESULTS/<task-id>/
└── supervisor/state/last-tick.md
```

Path is configurable via `SUPERVISOR_SYSTEM_PATH` env var.

## Navigation

- ↑ [README.md](./README.md)
- → [docs/INDEX.md](./docs/INDEX.md)
