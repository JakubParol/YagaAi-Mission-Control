# AGENTS.md — Mission Control CLI

## What This Is

Command-line interface for Mission Control focused on planning and observability workflows.

## Scope

### In scope (v1)

- CLI command surface for Mission Control API v1
- Planning entities and workflows:
  - projects, epics, stories, tasks, backlogs, assignments, labels
- Observability workflows:
  - costs, requests, imports
- Usable terminal UX:
  - concise table/text output for humans
  - JSON output mode for automation

### Out of scope (v1)

- Local business logic divergence from API rules
- Real-time streaming/WebSocket UX
- Auth policy design (CLI only consumes configured auth/actor headers)

## Required Reading (Mandatory)

Before making changes in `apps/cli`, read:

1. [Root AGENTS.md](../../AGENTS.md)
2. [/home/kuba/.openclaw/standards/coding-standards.md](/home/kuba/.openclaw/standards/coding-standards.md)
3. [/home/kuba/.openclaw/standards/documentation.md](/home/kuba/.openclaw/standards/documentation.md)
4. [docs/INDEX.md](./docs/INDEX.md)
5. [services/api/docs/API_CONTRACTS.md](../../services/api/docs/API_CONTRACTS.md)

## Rules

- API contracts are the source of truth for request/response shapes.
- Do not encode backend-only workflow rules in CLI; validate only what improves UX.
- Keep command names stable and explicit; avoid ambiguous aliases as defaults.
- Keep output deterministic for scriptability in JSON mode.

## Navigation

- ↑ [Root AGENTS.md](../../AGENTS.md)
- → [README.md](./README.md)
- → [docs/INDEX.md](./docs/INDEX.md)
