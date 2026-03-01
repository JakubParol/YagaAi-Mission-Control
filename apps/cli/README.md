# Mission Control CLI

Command-line interface for Mission Control.

The CLI is the operator-focused entry point for planning and observability workflows exposed by the Mission Control API.

## Status

v1 implemented. All planning and observability command groups are functional.

## Scope (v1)

- Planning operations mapped to `/v1/planning` API resources:
  - projects, epics, stories, tasks, backlogs, assignments, labels, agents
- Observability operations mapped to `/v1/observability` API resources:
  - costs, requests, imports
- Human-friendly table output with optional JSON mode (`--output json`) for scripting

## Getting Started

```bash
# Install dependencies
cd apps/cli
npm install

# Development (runs via tsx, no build needed)
npm run dev -- project list

# Build
npm run build

# Run built version
node dist/index.js project list
# or link globally:
npm link
mc project list
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `MC_API_BASE_URL` | `http://127.0.0.1:8080` | API base URL |
| `MC_ACTOR_ID` | — | Actor identity header |
| `MC_ACTOR_TYPE` | `user` | Actor type header |
| `MC_OUTPUT` | `table` | Output mode: `table` or `json` |
| `MC_TIMEOUT_SECONDS` | `30` | HTTP request timeout |

All env vars can be overridden with CLI flags (`--api-base`, `--actor-id`, `--actor-type`, `--output`, `--timeout-seconds`).

See [docs/CONFIGURATION.md](./docs/CONFIGURATION.md) for full details.

## Repository Structure

```
apps/cli/
├── src/
│   ├── index.ts                          # Entry point, program setup
│   ├── core/                             # Shared infrastructure
│   │   ├── config.ts                     # Runtime config resolution
│   │   ├── errors.ts                     # Error classes + exit codes
│   │   ├── envelope.ts                   # API envelope unwrapping
│   │   ├── http.ts                       # HTTP client (fetch-based)
│   │   ├── kv.ts                         # Key-value parsing utilities
│   │   ├── output.ts                     # Table/JSON output rendering
│   │   ├── payload.ts                    # Payload builder (--json/--file/--set)
│   │   └── runtime.ts                    # CommandContext type
│   └── features/
│       ├── planning/
│       │   ├── commands.ts               # All planning commands
│       │   └── resources.ts              # Resource path specs
│       └── observability/
│           └── commands.ts               # Observability commands
├── scripts/
│   └── lint.sh                           # ESLint + TypeScript check
├── docs/                                 # CLI-specific documentation
├── package.json
├── tsconfig.json
└── eslint.config.mjs
```

## Dependencies

- Runtime: [commander](https://www.npmjs.com/package/commander) (CLI framework)
- API contracts source of truth: `services/api/docs/API_CONTRACTS.md`

## Links

- [AGENTS.md](./AGENTS.md)
- [CLI docs index](./docs/INDEX.md)
- [Root README](../../README.md)
