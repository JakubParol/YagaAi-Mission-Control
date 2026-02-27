# API Contracts — Mission Control v1

**Status:** Draft v1.0
**Date:** 2026-02-27
**Applies to:** `services/api` `/v1` endpoints

---

## 1) Response Envelope

All responses use a consistent envelope:

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

Pydantic models:

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

## 4) Resource Contracts

### Conventions

- All IDs are UUIDs (string).
- Timestamps are ISO 8601 strings with timezone (`Z`).
- `key` is the human-readable identifier (e.g. `MC-42`), read-only, server-generated.
- Create requests use `Create` suffix, update requests use `Update` suffix.
- Update uses `PATCH` semantics: only provided fields are changed.

---

### 4.1) Projects

**Base path:** `/v1/projects`

#### `POST /v1/projects` — Create project

Request:
```jsonc
{
  "key": "MC",                // required, unique, uppercase letters
  "name": "Mission Control",  // required
  "description": "..."        // optional
}
```

Response: `201` with created project. A default backlog is auto-created.

#### `GET /v1/projects` — List projects

Query: `status`, `sort`, `limit`, `offset`.

#### `GET /v1/projects/{id}` — Get project

#### `PATCH /v1/projects/{id}` — Update project

Updatable: `name`, `description`, `status` (`ACTIVE`/`ARCHIVED`).

#### `DELETE /v1/projects/{id}` — Delete project

Hard delete. Cascades to epics, stories, tasks, backlogs under this project.
Returns `204`.

---

### 4.2) Epics

**Base path:** `/v1/projects/{project_id}/epics`

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

#### `GET .../epics` — List epics

Query: `status`, `is_blocked`, `sort`, `limit`, `offset`.

#### `GET .../epics/{id}` — Get epic

#### `PATCH .../epics/{id}` — Update epic

Updatable: `title`, `description`, `status`, `status_override`, `is_blocked`, `blocked_reason`, `priority`, `metadata_json`.

Setting `status` when `status_mode=DERIVED` sets `status_override` (temporary, clears on next child change).

#### `DELETE .../epics/{id}` — Delete epic

Hard delete. Returns `204`.

---

### 4.3) Stories

**Base path:** `/v1/stories`

Stories can be project-less or project-scoped. Single flat collection, filtered by `project_id` and/or `epic_id`.

#### `POST /v1/stories` — Create story

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

#### `GET /v1/stories` — List stories

Query: `project_id`, `epic_id`, `status`, `is_blocked`, `story_type`, `sort`, `limit`, `offset`.

#### `GET /v1/stories/{id}` — Get story

Includes computed fields: `effective_status` (derived if tasks exist), `task_count`, `tasks_done_count`.

#### `PATCH /v1/stories/{id}` — Update story

Updatable: `project_id`, `epic_id`, `title`, `intent`, `description`, `story_type`, `status`, `status_override`, `is_blocked`, `blocked_reason`, `priority`, `metadata_json`.

Side effects:
- Setting `project_id` on a project-less story triggers key generation and removal from global backlog.

#### `DELETE /v1/stories/{id}` — Delete story

Hard delete. Cascades to child tasks. Returns `204`.

---

### 4.4) Tasks

**Base path:** `/v1/tasks`

Tasks can be project-less or project-scoped, optionally linked to a story.

#### `POST /v1/tasks` — Create task

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

#### `GET /v1/tasks` — List tasks

Query: `project_id`, `story_id`, `status`, `is_blocked`, `task_type`, `current_assignee_agent_id`, `sort`, `limit`, `offset`.

#### `GET /v1/tasks/{id}` — Get task

Includes: current assignment (if any), labels.

#### `PATCH /v1/tasks/{id}` — Update task

Updatable: `project_id`, `story_id`, `title`, `objective`, `task_type`, `status`, `is_blocked`, `blocked_reason`, `priority`, `estimate_points`, `due_at`, `metadata_json`.

Side effects:
- Status change to `DONE` auto-closes active assignment.
- Status change triggers parent story/epic status re-derivation.
- Setting `project_id` on project-less task triggers key generation and removal from global backlog.

#### `DELETE /v1/tasks/{id}` — Delete task

Hard delete. Returns `204`.

---

### 4.5) Backlogs

**Base path:** `/v1/backlogs`

Backlogs can be global (`project_id=null`) or project-scoped.

#### `POST /v1/backlogs` — Create backlog

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

#### `GET /v1/backlogs` — List backlogs

Query: `project_id`, `status`, `kind`, `sort`, `limit`, `offset`.
Use `project_id=null` to list global backlogs.

#### `GET /v1/backlogs/{id}` — Get backlog

Includes story count, task count.

#### `PATCH /v1/backlogs/{id}` — Update backlog

Updatable: `name`, `status`, `goal`, `start_date`, `end_date`, `metadata_json`.

#### `DELETE /v1/backlogs/{id}` — Delete backlog

Hard delete. Items in the backlog are detached (not deleted). Returns `204`.

#### `POST /v1/backlogs/{id}/stories` — Add story to backlog

```jsonc
{ "story_id": "...", "position": 0 }
```

Enforces: story can be in max one backlog. Global backlog only accepts project-less stories.
Returns `200`.

#### `DELETE /v1/backlogs/{id}/stories/{story_id}` — Remove story from backlog

Returns `204`.

#### `POST /v1/backlogs/{id}/tasks` — Add task to backlog

```jsonc
{ "task_id": "...", "position": 0 }
```

Same constraints as stories. Returns `200`.

#### `DELETE /v1/backlogs/{id}/tasks/{task_id}` — Remove task from backlog

Returns `204`.

#### `PATCH /v1/backlogs/{id}/reorder` — Reorder items

```jsonc
{
  "stories": [{"story_id": "...", "position": 0}, ...],
  "tasks": [{"task_id": "...", "position": 1}, ...]
}
```

Returns `200`.

---

### 4.6) Assignments

**Base path:** `/v1/tasks/{task_id}/assignments`

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

**Base path:** `/v1/labels`

#### `POST /v1/labels` — Create label

```jsonc
{
  "project_id": "...",  // optional (null = global)
  "name": "bug",        // required
  "color": "#ff0000"    // optional
}
```

Returns `201`.

#### `GET /v1/labels` — List labels

Query: `project_id` (use `project_id=null` for global only), `limit`, `offset`.

#### `DELETE /v1/labels/{id}` — Delete label

Hard delete. Removes from all story/task associations. Returns `204`.

#### `POST /v1/stories/{id}/labels` — Attach label to story

```jsonc
{ "label_id": "..." }
```

#### `DELETE /v1/stories/{id}/labels/{label_id}` — Detach label from story

#### `POST /v1/tasks/{id}/labels` — Attach label to task

```jsonc
{ "label_id": "..." }
```

#### `DELETE /v1/tasks/{id}/labels/{label_id}` — Detach label from task

---

## Navigation

- ↑ [Docs Index](./INDEX.md)
- ← [Architecture](./ARCHITECTURE.md)
- → [Auth](./AUTH.md)
- → [Status Transitions](./STATUS_TRANSITIONS.md)
- → [Operational Notes](./OPERATIONAL.md)
