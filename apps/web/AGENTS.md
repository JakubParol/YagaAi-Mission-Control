# AGENTS.md — Mission Control Web

## What This Is

Next.js 15 dashboard for the Mission Control platform. Provides agent monitoring, LLM cost tracking, stories/tasks board, and Langfuse data import.

## Scope

- **In scope:** Dashboard UI, Next.js API routes, filesystem adapters, Langfuse import, planning DB schema
- **Out of scope:** REST API (see `services/api/`), CLI (see `apps/cli/`)

## Required Reading

Before making changes, read:

1. This file
2. `src/lib/types.ts` — domain model
3. `src/lib/adapters/` — understand the read layer before adding features

## Tech Decisions

| Decision | Rationale |
|---|---|
| Server Components for data | Adapters use `fs` — must be server-only |
| `server-only` package | Enforces adapters never leak to client bundles |
| `js-yaml` for YAML parsing | Lightweight, widely used, handles task YAML well |
| `force-dynamic` on pages | Data comes from filesystem — must be fresh |
| Dark mode default | `<html className="dark">` — operator dashboard aesthetic |
| better-sqlite3 | Synchronous SQLite for Next.js server context |

## Rules

- **Adapters are the only filesystem interface.** No `fs` imports outside `src/lib/adapters/`.
- **Types are the contract.** UI components depend on types from `src/lib/types.ts`, not raw data shapes.
- **Server-only enforcement.** Every adapter file must `import "server-only"` at the top.

## Data Sources

1. **Supervisor System filesystem** — agent state, stories, tasks (read via adapters at `SUPERVISOR_SYSTEM_PATH`)
2. **SQLite** (`data/mission-control.db`) — Langfuse import data, planning schema

## Navigation

- ↑ [Root AGENTS.md](../../AGENTS.md)
- → [Root docs/INDEX.md](../../docs/INDEX.md)
