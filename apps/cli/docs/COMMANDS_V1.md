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
| `epic` | `list`, `get`, `create`, `update`, `delete` |
| `story` | `list`, `get`, `create`, `update`, `delete` |
| `task` | `list`, `get`, `create`, `update`, `delete`, `assign`, `unassign`, `assignments` |
| `backlog` | `list`, `get`, `create`, `update`, `delete`, `add-story`, `remove-story`, `add-task`, `remove-task`, `reorder` |
| `agent` | `list`, `get`, `create`, `update`, `delete` |
| `label` | `list`, `get`, `create`, `update`, `delete`, `attach-story`, `detach-story`, `attach-task`, `detach-task` |

## Observability Commands

| Group | Core Commands |
|---|---|
| `obs costs` | (direct, no subcommand) |
| `obs requests` | `list`, `models` |
| `obs import` | `run`, `status` |

## Examples

```bash
mc project list --limit 20 --offset 0
mc project create --set key=MC --set name="Mission Control"
mc project get --id <uuid>
mc project get --by key=MC
mc task list --project-id <uuid> --status TODO,IN_PROGRESS --sort priority,-updated_at
mc task assign --id <uuid> --agent-id <uuid> --reason "handoff"
mc task assignments --id <uuid>
mc backlog add-story --backlog-id <uuid> --story-id <uuid> --position 0
mc label attach-task --task-id <uuid> --label-id <uuid>
mc obs costs --days 7
mc obs requests list --model claude-sonnet-4-20250514 --limit 50
mc obs import run
```

## Output Modes

- `table` (default): optimized for interactive terminal usage
- `json`: raw envelope-compatible output for scripting

## Navigation

- ↑ [docs/INDEX.md](./INDEX.md)
- ↑ [CLI_SCOPE_V1.md](./CLI_SCOPE_V1.md)
- → [CONFIGURATION.md](./CONFIGURATION.md)
