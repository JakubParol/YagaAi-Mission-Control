# AGENTS.md - Mission Control Web

## What This Is

Next.js 16 dashboard for the Mission Control platform. Provides observability views (LLM costs) and planning views (projects, stories, tasks).

## Scope

- **In scope:** Dashboard UI, planning views, API-backed planning and observability workflows
- **Out of scope:** REST API (see `services/api/`), CLI (see `apps/cli/`)

## Required Reading

Before making changes, read:

1. This file
2. `src/lib/types.ts` - domain model
3. `src/lib/dashboard-types.ts` - dashboard data shapes

## Tech Decisions

| Decision | Rationale |
|---|---|
| Dark mode default | `<html className="dark">` - operator dashboard aesthetic |
| API-first data access | UI reads planning and observability data through Mission Control API |
| `force-dynamic` on pages | Data comes from API - must be fresh |

## Rules

- **Types are the contract.** UI components depend on types from `src/lib/types.ts`, not raw data shapes.

## Data Sources

1. **FastAPI** (`services/api/`) - planning, observability, and control-plane data via REST

## Navigation

- [Root AGENTS.md](../../AGENTS.md)
- [Root docs/INDEX.md](../../docs/INDEX.md)
