# Commands v1

Defines command taxonomy and naming conventions for Mission Control CLI.

## Naming Rules

- Binary name: `mc`
- Resource-first command groups: `project`, `epic`, `story`, `task`, `backlog`, `label`, `obs`
- Verb set (preferred): `list`, `get`, `create`, `update`, `delete`
- Mutations that represent workflow actions use explicit verbs:
  - `task assign`, `task unassign`, `backlog add-item`, `backlog remove-item`

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
| `epic` | `list`, `get`, `create`, `update`, `delete`, `overview`, `stories`, `children` |
| `story` | `list`, `get`, `create`, `update`, `delete`, `children` |
| `task` | `list`, `get`, `create`, `update`, `delete`, `assign`, `unassign`, `assignments`, `children` |
| `backlog` | `list`, `get`, `create`, `update`, `delete`, `start`, `complete`, `transition-kind`, `add-item`, `remove-item`, `active-sprint` |
| `agent` | `list`, `get`, `create`, `update`, `delete`, `sync` |
| `label` | `list`, `get`, `create`, `update`, `delete`, `attach`, `detach` |

## Control Plane Commands

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

All commands that accept `--project-id` also accept key-based alternatives.
Parent filtering uses unified `--parent-id` / `--parent-key`.

| UUID option | Key option | Example |
|---|---|---|
| `--project-id <uuid>` | `--project-key <key>` | `--project-key MC` |
| `--parent-id <uuid>` | `--parent-key <key>` | `--parent-key MC-1` |

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
mc story list --project-key MC --parent-key MC-1
mc epic overview --project-key MC --sort -progress --output table
mc epic overview --project-key MC --label CLI --sort updated --output json
mc epic stories --parent-key MC-380 --status TODO,IN_PROGRESS --sort -updated_at
mc epic stories --parent-key MC-380 --output json
mc epic children --id <uuid>
mc story children --id <uuid>
mc task children --id <uuid>
mc task assign --id <uuid> --agent-id <uuid> --reason "handoff"
mc task assignments --id <uuid>
mc backlog add-item --backlog-id <uuid> --work-item-id <uuid> --rank aaa
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
mc label attach --work-item-id <uuid> --label-id <uuid>
mc label detach --work-item-id <uuid> --label-id <uuid>
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
mc run tail --run-id incident-2026-03-08 --event-type control-plane.watchdog.action --max-polls 5 --interval-ms 2000 --output json
```

Agent fallback precedence for consumers is: `avatar` -> `initials` -> derived initials from `name` + `last_name` -> first letter of `name`.

## Multiline Text in `--set`

The `--set` flag automatically unescapes `\n` (newline), `\t` (tab), and `\\` (literal backslash) in string values. This means you can pass multiline content inline:

```bash
# Inline newlines via \n (recommended for short text)
mc story update --by key=MC-100 --set description='Line 1\nLine 2\nLine 3'

# ANSI-C quoting also works (bash/zsh)
mc story update --by key=MC-100 --set description=$'Line 1\nLine 2'
```

For longer multiline content, use `--set-file` to read the value from a file:

```bash
# Read description from a file (preserves all whitespace and newlines)
mc story create --project-id <uuid> \
  --set title='My Story' \
  --set-file description=./description.md

# Combine --set and --set-file freely
mc task update --by key=MC-200 \
  --set status=IN_PROGRESS \
  --set-file notes=./notes.txt
```

**Escape rules for `--set` string values:**

| Input | Output | Notes |
|---|---|---|
| `\n` | newline | Most common use case |
| `\t` | tab | |
| `\\` | `\` | Use when you need a literal backslash |
| `\x` | `\x` | Unknown sequences are preserved as-is |

Non-string values (booleans, numbers, `null`, JSON objects/arrays) are not affected by escape processing.

## Output Modes

- `table` (default): optimized for interactive terminal usage
- `json`: raw envelope-compatible output for scripting

## Navigation

- ↑ [docs/INDEX.md](./INDEX.md)
- ↑ [CLI_SCOPE_V1.md](./CLI_SCOPE_V1.md)
- → [CONFIGURATION.md](./CONFIGURATION.md)
