# CLI Scope v1

Defines what Mission Control CLI covers in v1.

Source of truth for API behavior: `services/api/docs/API_CONTRACTS.md`.

## Principles

- CLI mirrors API resources and workflows.
- CLI does not redefine API business rules.
- Every list command supports pagination-related parameters where API supports them.

## Module Coverage

### Planning (`/v1/planning`)

- Projects
- Epics
- Stories
- Tasks
- Backlogs (+ backlog item attach/detach/reorder)
- Assignments
- Labels

### Observability (`/v1/observability`)

- Costs
- Requests
- Imports

### Orchestration (`/v1/orchestration`)

- Run command submission (`/commands`)
- Run status read model (`/runs/{run_id}`)
- Run timeline tailing (`/timeline`)

## Endpoint-to-Command Mapping (v1)

| API Resource | Example CLI Group |
|---|---|
| `/v1/planning/projects` | `mc project ...` |
| `/v1/planning/projects/{id}/epics` | `mc epic ... --project <id>` |
| `/v1/planning/epics/overview` | `mc epic overview ...` |
| `/v1/planning/stories?epic_key=<key>` | `mc epic stories --epic-key <key> ...` |
| `/v1/planning/stories` | `mc story ...` |
| `/v1/planning/tasks` | `mc task ...` |
| `/v1/planning/backlogs` | `mc backlog ...` |
| `/v1/planning/tasks/{task_id}/assignments` | `mc task assign ...` |
| `/v1/planning/labels` | `mc label ...` |
| `/v1/observability/costs` | `mc obs costs ...` |
| `/v1/observability/requests` | `mc obs requests ...` |
| `/v1/observability/imports` | `mc obs import ...` |
| `/v1/orchestration/commands` | `mc run submit ...` |
| `/v1/orchestration/runs/{run_id}` | `mc run status --run-id <id>` |
| `/v1/orchestration/timeline` | `mc run tail --run-id <id> ...` |

## Non-goals (v1)

- Local offline mode with its own planning state
- Reconciliation engine for drift between CLI cache and API
- Custom workflow semantics not present in API contracts

## Navigation

- ↑ [docs/INDEX.md](./INDEX.md)
- → [COMMANDS_V1.md](./COMMANDS_V1.md)
- → [CONFIGURATION.md](./CONFIGURATION.md)
