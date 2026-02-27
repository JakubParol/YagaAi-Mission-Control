# AGENTS.md — Mission Control Web

## What This Is

Next.js 15 dashboard for the Mission Control platform. Provides observability views (LLM costs) and planning views (projects, stories, tasks).

## Scope

- **In scope:** Dashboard UI, planning views, planning DB schema (direct SQLite via better-sqlite3)
- **Out of scope:** REST API (see `services/api/`), CLI (see `apps/cli/`)

## Required Reading

Before making changes, read:

1. This file
2. `src/lib/types.ts` — domain model
3. `src/lib/dashboard-types.ts` — dashboard data shapes

## Tech Decisions

| Decision | Rationale |
|---|---|
| Dark mode default | `<html className="dark">` — operator dashboard aesthetic |
| better-sqlite3 | Synchronous SQLite for Next.js server context |
| `force-dynamic` on pages | Data comes from API — must be fresh |

## Rules

- **Types are the contract.** UI components depend on types from `src/lib/types.ts`, not raw data shapes.

## Data Sources

1. **FastAPI** (`services/api/`) — observability data (LLM costs, requests, Langfuse import) via REST
2. **SQLite** (`data/mission-control.db`) — planning schema (direct access via better-sqlite3)

## Navigation

- ↑ [Root AGENTS.md](../../AGENTS.md)
- → [Root docs/INDEX.md](../../docs/INDEX.md)
