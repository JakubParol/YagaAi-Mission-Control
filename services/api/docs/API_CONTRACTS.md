# API Contracts — Mission Control v1

**Status:** Draft v1.2
**Date:** 2026-03-01
**Applies to:** `services/api` — all `/v1` module endpoints

---

## 1) Response Envelope

All responses across all modules use a consistent envelope:

```jsonc
// Success (single item)
{
  "data": { ... },
  "meta": {}           // optional: computed fields, warnings
}

// Success (list)
{
  "data": [ ... ],
  "meta": {
    "total": 42,
    "limit": 20,
    "offset": 0
  }
}

// Error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable summary",
    "details": [ ... ]  // optional: per-field errors
  }
}
```

Pydantic models (in `shared/api/envelope.py`):

```python
class Envelope[T](BaseModel):
    data: T
    meta: dict[str, Any] = {}

class ListMeta(BaseModel):
    total: int
    limit: int
    offset: int

class ErrorDetail(BaseModel):
    field: str | None = None
    message: str

class ErrorResponse(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] = []
```

---

## 2) Error Model

| HTTP Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body/query fails validation |
| 400 | `BUSINESS_RULE_VIOLATION` | Workflow rule violated (e.g. backlog constraint) |
| 401 | `UNAUTHORIZED` | Missing/invalid credentials |
| 403 | `FORBIDDEN` | Authenticated but not permitted |
| 404 | `NOT_FOUND` | Entity does not exist |
| 409 | `CONFLICT` | Concurrent modification / duplicate key |
| 422 | `UNPROCESSABLE_ENTITY` | FastAPI default for Pydantic failures (kept as-is) |
| 500 | `INTERNAL_ERROR` | Unhandled server error |

Error codes are stable strings — clients should match on `code`, not `message`.

---

## 3) Pagination, Filtering, Sorting

Shared conventions used by list endpoints across all modules.

### Pagination

Offset-based for v1 (simple, sufficient for expected data volumes).

| Param | Type | Default | Max |
|---|---|---|---|
| `limit` | int | 20 | 100 |
| `offset` | int | 0 | — |

Response `meta` always includes `total`, `limit`, `offset`.

### Filtering

Filters are query params on list endpoints. Convention:

| Pattern | Example | Meaning |
|---|---|---|
| `field=value` | `status=TODO` | Exact match |
| `field=v1,v2` | `status=TODO,IN_PROGRESS` | IN list |
| `project_id=null` | — | Filter for NULL |
| `project_key=MC` | — | Resolve project key to UUID, filter by project |
| `is_blocked=true` | — | Boolean filter |

Date range filters use `_after` / `_before` suffixes:
- `created_after=2026-01-01T00:00:00Z`
- `created_before=2026-02-01T00:00:00Z`

### Sorting

| Param | Default | Example |
|---|---|---|
| `sort` | `-created_at` | `sort=priority,-updated_at` |

Prefix `-` means descending. Multiple fields separated by comma.

Sortable fields are documented per resource. Invalid sort fields return 400.

---

## 4) Planning Module — `/v1/planning`

### Conventions

- All IDs are UUIDs (string).
- Timestamps are ISO 8601 strings with timezone (`Z`).
- `key` is the human-readable identifier (e.g. `MC-42`), read-only, server-generated.
- Create requests use `Create` suffix, update requests use `Update` suffix.
- Update uses `PATCH` semantics: only provided fields are changed.

---

### 4.1) Projects

**Base path:** `/v1/planning/projects`

#### `POST /v1/planning/projects` — Create project

Request:
```jsonc
{
  "key": "MC",                // required, unique, uppercase letters
  "name": "Mission Control",  // required
  "description": "...",       // optional
  "repo_root": "/home/..."    // optional, absolute path to local repo root
}
```

Response: `201` with created project. A default backlog is auto-created.

#### `GET /v1/planning/projects` — List projects

Query: `status`, `sort`, `limit`, `offset`.

#### `GET /v1/planning/projects/{id}` — Get project

#### `PATCH /v1/planning/projects/{id}` — Update project

Updatable: `name`, `description`, `status` (`ACTIVE`/`ARCHIVED`), `repo_root`.

#### `DELETE /v1/planning/projects/{id}` — Delete project

Hard delete. Cascades to epics, stories, tasks, backlogs under this project.
Returns `204`.

---

### 4.2) Epics

**Base path:** `/v1/planning/projects/{project_id}/epics`

Epics always belong to a project (no project-less epics).

#### `POST .../epics` — Create epic

Request:
```jsonc
{
  "title": "...",           // required
  "description": "...",     // optional
  "priority": 1             // optional
}
```

`key` is auto-generated. `status` defaults to `TODO`. `status_mode` defaults to `MANUAL`.

#### `GET /v1/planning/epics` — List epics

Query: `project_id`, `project_key`, `status`, `is_blocked`, `sort`, `limit`, `offset`.

`project_key` — same behavior as stories (see above).

#### `GET /v1/planning/epics/by-key/{key}` — Get epic by key

Returns the same response as `GET .../epics/{id}`. Key lookup is case-insensitive.

Returns `404` if no epic matches the key.

#### `GET .../epics/{id}` — Get epic

#### `PATCH .../epics/{id}` — Update epic

Updatable: `title`, `description`, `status`, `status_override`, `is_blocked`, `blocked_reason`, `priority`, `metadata_json`.

Setting `status` when `status_mode=DERIVED` sets `status_override` (temporary, clears on next child change).

#### `DELETE .../epics/{id}` — Delete epic

Hard delete. Returns `204`.

---

### 4.3) Stories

**Base path:** `/v1/planning/stories`

Stories can be project-less or project-scoped. Single flat collection, filtered by `project_id` and/or `epic_id`.

#### `POST /v1/planning/stories` — Create story

Request:
```jsonc
{
  "project_id": "...",      // optional (null = project-less)
  "epic_id": "...",         // optional
  "title": "...",           // required
  "intent": "...",          // optional
  "description": "...",     // optional
  "story_type": "feature",  // required
  "priority": 1             // optional
}
```

`status` defaults to `TODO`. `key` auto-generated if `project_id` is set.

#### `GET /v1/planning/stories` — List stories

Query: `project_id`, `project_key`, `epic_id`, `status`, `is_blocked`, `story_type`, `sort`, `limit`, `offset`.

`project_key` resolves a human-readable key (e.g. `MC`) to `project_id`. Takes precedence over `project_id` if both provided. Returns 404 if key not found. Case-insensitive.

#### `GET /v1/planning/stories/by-key/{key}` — Get story by key

Returns the same response as `GET /v1/planning/stories/{id}`. Key lookup is case-insensitive.

Returns `404` if no story matches the key.

#### `GET /v1/planning/stories/{id}` — Get story

Includes computed fields: `task_count`.

#### `PATCH /v1/planning/stories/{id}` — Update story

Updatable: `project_id`, `epic_id`, `title`, `intent`, `description`, `story_type`, `status`, `is_blocked`, `blocked_reason`, `priority`, `metadata_json`.

Side effects:
- Setting `project_id` on a project-less story triggers key generation and removal from global backlog.

#### `DELETE /v1/planning/stories/{id}` — Delete story

Hard delete. Cascades to child tasks. Returns `204`.

---

### 4.4) Tasks

**Base path:** `/v1/planning/tasks`

Tasks can be project-less or project-scoped, optionally linked to a story.

#### `POST /v1/planning/tasks` — Create task

Request:
```jsonc
{
  "project_id": "...",         // optional
  "story_id": "...",           // optional
  "title": "...",              // required
  "objective": "...",          // optional
  "task_type": "coding",       // required
  "priority": 1,               // optional
  "estimate_points": 3.0,      // optional
  "due_at": "2026-03-01T..."   // optional
}
```

`status` defaults to `TODO`. `key` auto-generated if `project_id` is set.

#### `GET /v1/planning/tasks` — List tasks

Query: `project_id`, `project_key`, `story_id`, `status`, `is_blocked`, `task_type`, `current_assignee_agent_id`, `sort`, `limit`, `offset`.

`project_key` — same behavior as stories (see above).

#### `GET /v1/planning/tasks/by-key/{key}` — Get task by key

Returns the same response as `GET /v1/planning/tasks/{id}`. Key lookup is case-insensitive.

Returns `404` if no task matches the key.

#### `GET /v1/planning/tasks/{id}` — Get task

Includes: current assignment (if any), labels.

#### `PATCH /v1/planning/tasks/{id}` — Update task

Updatable: `project_id`, `story_id`, `title`, `objective`, `task_type`, `status`, `is_blocked`, `blocked_reason`, `priority`, `estimate_points`, `due_at`, `metadata_json`.

Side effects:
- Status change to `DONE` auto-closes active assignment.
- Status change triggers parent story/epic status re-derivation.
- Setting `project_id` on project-less task triggers key generation and removal from global backlog.

#### `DELETE /v1/planning/tasks/{id}` — Delete task

Hard delete. Returns `204`.

---

### 4.5) Backlogs

**Base path:** `/v1/planning/backlogs`

Backlogs can be global (`project_id=null`) or project-scoped.

#### `POST /v1/planning/backlogs` — Create backlog

Request:
```jsonc
{
  "project_id": "...",     // optional (null = global)
  "name": "Sprint 1",     // required
  "kind": "SPRINT",       // required: BACKLOG | SPRINT | IDEAS
  "goal": "...",           // optional
  "start_date": "...",     // optional
  "end_date": "..."        // optional
}
```

`status` defaults to `ACTIVE`.

#### `GET /v1/planning/backlogs` — List backlogs

Query: `project_id`, `project_key`, `status`, `kind`, `sort`, `limit`, `offset`.
Use `project_id=null` to list global backlogs. `project_key` — same behavior as stories (see above).

#### `GET /v1/planning/backlogs/{id}` — Get backlog

Includes story count, task count.

#### `PATCH /v1/planning/backlogs/{id}` — Update backlog

Updatable: `name`, `status`, `goal`, `start_date`, `end_date`, `metadata_json`.

#### `DELETE /v1/planning/backlogs/{id}` — Delete backlog

Hard delete. Items in the backlog are detached (not deleted). Returns `204`.

#### `POST /v1/planning/backlogs/{id}/stories` — Add story to backlog

```jsonc
{ "story_id": "...", "position": 0 }
```

Enforces: story can be in max one backlog. Global backlog only accepts project-less stories.
Returns `200`.

#### `DELETE /v1/planning/backlogs/{id}/stories/{story_id}` — Remove story from backlog

Returns `204`.

#### `POST /v1/planning/backlogs/{id}/tasks` — Add task to backlog

```jsonc
{ "task_id": "...", "position": 0 }
```

Same constraints as stories. Returns `200`.

#### `DELETE /v1/planning/backlogs/{id}/tasks/{task_id}` — Remove task from backlog

Returns `204`.

#### `PATCH /v1/planning/backlogs/{id}/reorder` — Reorder items

```jsonc
{
  "stories": [{"story_id": "...", "position": 0}, ...],
  "tasks": [{"task_id": "...", "position": 1}, ...]
}
```

Returns `200`.

#### `GET /v1/planning/backlogs/{id}/stories` — List stories in a backlog

Returns stories belonging to the given backlog, ordered by `position ASC`.
Story objects match the active sprint story shape (`id`, `key`, `title`, `status`, `priority`, `story_type`, `position`, `task_count`, `done_task_count`).

Response `200`:
```jsonc
{
  "data": [
    {
      "id": "...",
      "key": "MC-42",
      "title": "Implement board view",
      "status": "IN_PROGRESS",
      "priority": 1,
      "story_type": "feature",
      "position": 0,
      "task_count": 3,
      "done_task_count": 1
    }
  ]
}
```

Returns `404` if backlog does not exist.
Returns empty list when backlog has no stories.

#### `GET /v1/planning/backlogs/active-sprint` — Get active sprint board

Returns the first active sprint (`kind=SPRINT`, `status=ACTIVE`) for a project, including its stories ordered by backlog position.

Query: `project_id` or `project_key` (at least one required). `project_key` resolves to `project_id` (case-insensitive).

Response `200`:
```jsonc
{
  "data": {
    "backlog": {
      "id": "...",
      "project_id": "...",
      "name": "Sprint 1",
      "kind": "SPRINT",
      "status": "ACTIVE",
      "is_default": false,
      "goal": "Ship MVP",
      "start_date": "2026-03-01",
      "end_date": "2026-03-15",
      // ... standard backlog fields
    },
    "stories": [
      {
        "id": "...",
        "key": "MC-42",
        "title": "Implement board view",
        "status": "IN_PROGRESS",
        "priority": 1,
        "story_type": "feature",
        "position": 0
      }
    ]
  }
}
```

Returns `404` if no active sprint exists for the given project.
Returns `422` if `project_id` is missing.

---

### 4.6) Assignments

**Base path:** `/v1/planning/tasks/{task_id}/assignments`

#### `POST .../assignments` — Assign agent to task

```jsonc
{
  "agent_id": "...",       // required
  "reason": "..."          // optional
}
```

Auto-closes any existing active assignment on this task (handoff). Returns `201`.

#### `GET .../assignments` — List assignment history

Returns all assignments (active + past) for this task, ordered by `assigned_at` desc.

#### `DELETE .../assignments/current` — Unassign current agent

Sets `unassigned_at` on active assignment. Returns `204`. Returns `404` if no active assignment.

---

### 4.7) Labels

**Base path:** `/v1/planning/labels`

#### `POST /v1/planning/labels` — Create label

```jsonc
{
  "project_id": "...",  // optional (null = global)
  "name": "bug",        // required
  "color": "#ff0000"    // optional
}
```

Returns `201`.

#### `GET /v1/planning/labels` — List labels

Query: `project_id`, `project_key` (use `project_id=null` for global only), `limit`, `offset`.

`project_key` — same behavior as stories (see above).

#### `DELETE /v1/planning/labels/{id}` — Delete label

Hard delete. Removes from all story/task associations. Returns `204`.

#### `POST /v1/planning/stories/{id}/labels` — Attach label to story

```jsonc
{ "label_id": "..." }
```

#### `DELETE /v1/planning/stories/{id}/labels/{label_id}` — Detach label from story

#### `POST /v1/planning/tasks/{id}/labels` — Attach label to task

```jsonc
{ "label_id": "..." }
```

#### `DELETE /v1/planning/tasks/{id}/labels/{label_id}` — Detach label from task

---

## 5) Observability Module — `/v1/observability`

LLM cost tracking, request browsing, and Langfuse data import.

### Conventions

- Observability endpoints are mostly read-only (GET), except for the import trigger (POST).
- Cost/request data originates from Langfuse and is cached locally in SQLite.

---

### 5.1) Costs

**Base path:** `/v1/observability/costs`

#### `GET /v1/observability/costs` — Get cost summary

Returns aggregated LLM cost metrics.

Query: `from` (ISO timestamp), `to` (ISO timestamp), `days` (1/7/30 shortcut).

Response:
```jsonc
{
  "data": {
    "today_cost": 12.34,
    "yesterday_cost": 8.90,
    "today_requests": 156,
    "avg_cost_per_request": 0.079,
    "by_model": [
      {
        "model": "claude-sonnet-4-20250514",
        "requests": 80,
        "tokens_in": 50000,
        "tokens_out": 20000,
        "total_cost": 5.60
      }
    ]
  },
  "meta": {
    "from": "2026-02-20T00:00:00Z",
    "to": "2026-02-27T23:59:59Z"
  }
}
```

---

### 5.2) Requests

**Base path:** `/v1/observability/requests`

#### `GET /v1/observability/requests` — List LLM requests

Paginated list of individual LLM observations.

Query: `model`, `from`, `to`, `page` (1-based), `limit`.

Response item:
```jsonc
{
  "id": "...",
  "name": "...",
  "model": "claude-sonnet-4-20250514",
  "tokens_in": 1200,
  "tokens_out": 450,
  "cost": 0.023,
  "latency_ms": 3200,
  "ttfb_ms": 800,
  "created_at": "2026-02-27T14:30:00Z"
}
```

#### `GET /v1/observability/requests/models` — List available models

Returns distinct model names from imported data.

Response:
```jsonc
{
  "data": ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"]
}
```

---

### 5.3) Imports

**Base path:** `/v1/observability/imports`

#### `POST /v1/observability/imports` — Trigger Langfuse import

Triggers a full or incremental import from Langfuse. Mode is auto-detected (full if no prior import, incremental otherwise).

Response `201`:
```jsonc
{
  "data": {
    "import_id": "...",
    "mode": "incremental",    // "full" | "incremental"
    "status": "completed",    // "completed" | "failed"
    "records_imported": 42,
    "from_timestamp": "...",
    "to_timestamp": "..."
  }
}
```

#### `GET /v1/observability/imports/status` — Get import status

Returns last import metadata and record counts.

Response:
```jsonc
{
  "data": {
    "last_import": {
      "id": "...",
      "mode": "incremental",
      "status": "completed",
      "completed_at": "2026-02-27T15:00:00Z",
      "records_imported": 42
    },
    "total_metrics": 350,
    "total_requests": 12000
  }
}
```

---

## Navigation

- ↑ [Docs Index](./INDEX.md)
- ← [Architecture](./ARCHITECTURE.md)
- → [Auth](./AUTH.md)
- → [Status Transitions](./STATUS_TRANSITIONS.md)
- → [Operational Notes](./OPERATIONAL.md)
