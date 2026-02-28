# AGENTS.md — Mission Control CLI

## What This Is

TypeScript CLI for Mission Control. Wraps the REST API (`/v1/planning/`) to provide command-line CRUD for projects, epics, stories, and tasks.

## Scope

- **In scope:** CLI commands for all planning entities (projects, epics, stories, tasks), assignments, labels
- **Out of scope:** Observability commands (v2), interactive/TUI mode (v2), offline mode

## Tech Stack

| Layer | Tech |
|-------|------|
| CLI framework | Commander.js |
| HTTP client | Axios |
| Output | chalk (colors), cli-table3 (tables) |
| Language | TypeScript (strict), CommonJS output |

## Structure

```
apps/cli/
├── src/
│   ├── index.ts           # Entry point — Commander setup
│   ├── config.ts           # Configuration loader (MC_API_URL)
│   ├── client.ts           # Axios-based API client
│   ├── types.ts            # TypeScript interfaces (Project, Epic, Story, Task)
│   ├── commands/
│   │   ├── projects.ts     # projects list|get|create|update|delete
│   │   ├── epics.ts        # epics list|get|create|update|delete
│   │   ├── stories.ts      # stories list|get|create|update|delete + labels
│   │   └── tasks.ts        # tasks list|get|create|update|delete + assign/unassign + labels
│   └── utils/
│       └── formatters.ts   # Table/JSON output helpers
├── package.json
├── tsconfig.json
├── .eslintrc.json
└── .gitignore
```

## Rules

- All commands go through the API client — no direct DB access
- Output supports `--json` flag for machine-readable output
- Error handling via Axios interceptors — API errors are formatted and displayed
- Follow workspace coding standards

## Required Reading

1. [Root AGENTS.md](../../AGENTS.md)
2. [API Contracts](../../services/api/docs/API_CONTRACTS.md) — endpoint specs this CLI wraps

## Navigation

- ↑ [Root AGENTS.md](../../AGENTS.md)
- → [README.md](./README.md)
