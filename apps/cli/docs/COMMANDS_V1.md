# Commands v1

Defines command taxonomy and naming conventions for Mission Control CLI.

## Naming Rules

- Binary name: `mc`
- Resource-first command groups: `project`, `epic`, `story`, `task`, `backlog`, `label`, `obs`
- Verb set (preferred): `list`, `get`, `create`, `update`, `delete`
- Mutations that represent workflow actions use explicit verbs:
  - `task assign`, `task unassign`, `backlog add-story`, `backlog reorder`

## Global Flags

- `--api-base <url>`
- `--actor-id <id>`
- `--actor-type <type>`
- `--output table|json`
- `--timeout-seconds <n>`

## Planning Commands

| Group | Core Commands |
|---|---|
| `project` | `list`, `get`, `create`, `update`, `delete` |
| `epic` | `list`, `get`, `create`, `update`, `delete`, `overview`, `stories` |
| `story` | `list`, `get`, `create`, `update`, `delete` |
| `task` | `list`, `get`, `create`, `update`, `delete`, `assign`, `unassign`, `assignments` |
| `backlog` | `list`, `get`, `create`, `update`, `delete`, `start`, `complete`, `transition-kind`, `add-story`, `remove-story`, `add-task`, `remove-task`, `reorder`, `active-sprint` |
| `agent` | `list`, `get`, `create`, `update`, `delete`, `sync` |
| `label` | `list`, `get`, `create`, `update`, `delete`, `attach-story`, `detach-story`, `attach-task`, `detach-task` |

## Orchestration Commands

| Group | Core Commands |
|---|---|
| `run` | `submit`, `status`, `metrics`, `tail` |

## Observability Commands

| Group | Core Commands |
|---|---|
| `obs costs` | (direct, no subcommand) |
| `obs requests` | `list`, `models` |
| `obs import` | `run`, `status` |

## Key-Based Filtering

All commands that accept `--project-id`, `--epic-id`, or `--story-id` also accept key-based alternatives:

| UUID option | Key option | Example |
|---|---|---|
| `--project-id <uuid>` | `--project-key <key>` | `--project-key MC` |
| `--epic-id <uuid>` | `--epic-key <key>` | `--epic-key MC-1` |
| `--story-id <uuid>` | `--story-key <key>` | `--story-key MC-42` |

- The CLI sends the key directly to the API, which resolves it server-side.
- `--*-id` and `--*-key` for the same entity are mutually exclusive.

## Examples

```bash
mc project list --limit 20 --offset 0
mc project create --set key=MC --set name="Mission Control"
mc project create --set key=MC --set name="Mission Control" --set is_default=true
mc project get --id <uuid>
mc project get --by key=MC
mc project update --by key=MC --set is_default=true
mc project update --by key=MC --set is_default=false
mc task list --project-key MC --status TODO,IN_PROGRESS --sort priority,-updated_at
mc story list --project-key MC --epic-key MC-1
mc epic overview --project-key MC --sort -progress --output table
mc epic overview --project-key MC --label CLI --sort updated --output json
mc epic stories --epic-key MC-380 --status TODO,IN_PROGRESS --sort -updated_at
mc epic stories --epic-key MC-380 --output json
mc task assign --id <uuid> --agent-id <uuid> --reason "handoff"
mc task assignments --id <uuid>
mc backlog add-story --backlog-id <uuid> --story-id <uuid> --position 0
mc backlog start --id <uuid> --project-key MC
mc backlog complete --id <uuid> --project-key MC
mc backlog transition-kind --id <uuid> --kind SPRINT --project-key MC
mc backlog update --id <uuid> --set kind=IDEAS --project-key MC
mc backlog active-sprint --project-key MC
mc agent list --output json
mc agent create --set openclaw_key=codex --set name=Codex --set last_name=Coder --set initials=CC --set avatar=https://cdn.example.com/codex.png
mc agent update --by key=codex --set avatar=null
mc agent update --by key=codex --set last_name=
mc agent update --by key=codex --set initials=
mc agent update --by key=codex --set avatar=
mc agent sync
mc label attach-task --task-id <uuid> --label-id <uuid>
mc obs costs --days 7
mc obs requests list --model claude-sonnet-4-20250514 --limit 50
mc obs import run
mc run submit --run-id run-123
mc run status --run-id run-123
mc run metrics
mc run tail --run-id run-123 --max-polls 3 --interval-ms 1000
```

## Failure Debug Workflow Example

```bash
# 1) Submit run command envelope
mc run submit --run-id incident-2026-03-08 --correlation-id incident-2026-03-08

# 2) Check current run state (status, watchdog info, lease details)
mc run status --run-id incident-2026-03-08 --output json

# 3) Inspect queue/retry/dead-letter and latency metrics
mc run metrics --output json

# 4) Tail latest timeline events for triage
mc run tail --run-id incident-2026-03-08 --event-type orchestration.watchdog.action --max-polls 5 --interval-ms 2000 --output json
```

Agent fallback precedence for consumers is: `avatar` -> `initials` -> derived initials from `name` + `last_name` -> first letter of `name`.

## Output Modes

- `table` (default): optimized for interactive terminal usage
- `json`: raw envelope-compatible output for scripting

## Navigation

- ↑ [docs/INDEX.md](./INDEX.md)
- ↑ [CLI_SCOPE_V1.md](./CLI_SCOPE_V1.md)
- → [CONFIGURATION.md](./CONFIGURATION.md)
