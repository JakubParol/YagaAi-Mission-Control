# API Contracts — Mission Control v1

**Status:** Draft v1.3
**Date:** 2026-03-08
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
Default sorting can be specialized by a specific endpoint (documented in that endpoint section).

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
  "repo_root": "/home/...",   // optional, absolute path to local repo root
  "is_default": true          // optional, makes this project the single default
}
```

Response: `201` with created project. A default backlog is auto-created.

#### `GET /v1/planning/projects` — List projects

Query: `status`, `sort`, `limit`, `offset`.

#### `GET /v1/planning/projects/{id}` — Get project

#### `PATCH /v1/planning/projects/{id}` — Update project

Updatable: `name`, `description`, `status` (`ACTIVE`/`ARCHIVED`), `repo_root`, `is_default`.

Project response includes `is_default` on create/list/get/update.

Single-default invariant:
- At most one project can have `is_default=true`.
- Setting one project to `is_default=true` automatically unsets any existing default project.
- Setting `is_default=false` does not auto-promote another project.

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

#### `GET /v1/planning/epics/overview` — Epic Overview aggregate

Purpose: return a lightweight, paginated aggregate for Epic health/progress views.

Query:
- Filters: `project_id`, `project_key`, `status`, `owner`, `is_blocked`, `label`, `text`
- Sort: `priority`, `progress_pct`, `progress_trend_7d`, `updated_at`, `blocked_count` (supports `-` prefix)
- Pagination: `limit`, `offset`

Response item fields:
- `epic_key`
- `title`
- `status`
- `progress_pct`
- `progress_trend_7d` (percentage-point completion gain in the last 7 days)
- `stories_total`
- `stories_done`
- `stories_in_progress`
- `blocked_count`
- `stale_days`

Notes:
- `owner` filters by assignee agent id found on stories in the epic.
- `label` matches by label name attached to stories in the epic.
- `text` performs partial match against epic `title` and `key`.

#### `GET /v1/planning/epics/by-key/{key}` — Get epic by key

Returns the same response as `GET .../epics/{id}`. Key lookup is case-insensitive.

Returns `404` if no epic matches the key.

#### `GET .../epics/{id}` — Get epic

#### `PATCH .../epics/{id}` — Update epic

Updatable: `title`, `description`, `status`, `status_override`, `is_blocked`, `blocked_reason`, `priority`, `metadata_json`.

Setting `status` when `status_mode=DERIVED` sets `status_override` (temporary, clears on next child change).

#### `POST /v1/planning/epics/{id}/status` — Quick action: change epic status

Request:
```jsonc
{ "status": "IN_PROGRESS" } // TODO | IN_PROGRESS | DONE
```

Response `200`:
```jsonc
{
  "data": {
    "epic_id": "...",
    "from_status": "TODO",
    "to_status": "IN_PROGRESS",
    "changed": true,
    "actor_id": "agent-1",
    "timestamp": "2026-03-07T...Z"
  }
}
```

Audit/event trail:
- emits `epic.status.changed` with `actor_id`, `actor_type`, `timestamp`, and scope (`flow=epic_overview`, `project_id`, `epic_id`).

#### `POST /v1/planning/epics/bulk/story-status` — Bulk update story status

Request:
```jsonc
{
  "story_ids": ["s1", "s2"],
  "status": "DONE" // TODO | IN_PROGRESS | CODE_REVIEW | VERIFY | DONE
}
```

Response `200` (per-record outcome):
```jsonc
{
  "data": {
    "operation": "BULK_UPDATE_STORY_STATUS",
    "total": 2,
    "succeeded": 1,
    "failed": 1,
    "results": [
      { "entity_id": "s1", "success": true, "timestamp": "..." },
      {
        "entity_id": "s2",
        "success": false,
        "timestamp": "...",
        "error_code": "NOT_FOUND",
        "error_message": "Story s2 not found"
      }
    ]
  }
}
```

Audit/event trail:
- each successful record emits `story.status.changed` with actor/timestamp/scope.

#### `POST /v1/planning/epics/bulk/active-sprint/add` — Bulk add stories to active sprint

Moves stories from product backlog to active sprint for a project.

Query: `project_id` or `project_key` (required).

Request:
```jsonc
{ "story_ids": ["s1", "s2"] }
```

Response `200` (per-record outcome): same bulk envelope as above, with `operation="ADD_TO_ACTIVE_SPRINT"`.

Validation/error semantics:
- Missing project selector → `400 VALIDATION_ERROR`
- No active sprint for project (per record) → `error_code = "NO_ACTIVE_SPRINT"`
- Other business/state issues are returned per record with explicit error code/message.

Audit/event trail:
- each successful record emits `story.sprint_membership.added` with actor/timestamp/scope.

#### `POST /v1/planning/epics/bulk/active-sprint/remove` — Bulk remove stories from active sprint

Moves stories from active sprint back to product backlog.

Query: `project_id` or `project_key` (required).

Request:
```jsonc
{ "story_ids": ["s1", "s2"] }
```

Response `200` (per-record outcome): same bulk envelope, with `operation="REMOVE_FROM_ACTIVE_SPRINT"`.

Audit/event trail:
- each successful record emits `story.sprint_membership.removed` with actor/timestamp/scope.

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
  "priority": 1,            // optional
  "current_assignee_agent_id": "..." // optional, null to unassign
}
```

`status` defaults to `TODO`. `key` auto-generated if `project_id` is set.

Create response `meta` includes story progress counters when `story_id` is set:
```jsonc
{
  "meta": {
    "story_task_count": 3,
    "story_done_task_count": 1
  }
}
```

Validation/conflict semantics:
- `400 VALIDATION_ERROR` when `project_id` or `story_id` does not exist
- `409 CONFLICT` when `project_id` conflicts with the story's project
- When `story_id` is provided without `project_id`, project is inferred from the story

#### `GET /v1/planning/stories` — List stories

Query: `project_id`, `project_key`, `epic_id`, `status`, `is_blocked`, `story_type`, `sort`, `limit`, `offset`.

`project_key` resolves a human-readable key (e.g. `MC`) to `project_id`. Takes precedence over `project_id` if both provided. Returns 404 if key not found. Case-insensitive.

#### `GET /v1/planning/stories/by-key/{key}` — Get story by key

Returns the same response as `GET /v1/planning/stories/{id}`. Key lookup is case-insensitive.

Returns `404` if no story matches the key.

#### `GET /v1/planning/stories/{id}` — Get story

Includes computed fields: `task_count`.

#### `PATCH /v1/planning/stories/{id}` — Update story

Updatable: `project_id`, `epic_id`, `title`, `intent`, `description`, `story_type`, `status`, `is_blocked`, `blocked_reason`, `priority`, `current_assignee_agent_id`, `metadata_json`.

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
Response `meta` includes story progress counters when the task belongs to a story.

#### `PATCH /v1/planning/tasks/{id}` — Update task

Updatable: `story_id`, `title`, `objective`, `task_type`, `status`, `is_blocked`, `blocked_reason`, `priority`, `estimate_points`, `due_at`, `current_assignee_agent_id`, `metadata_json`.

Side effects:
- Status change to `DONE` auto-closes active assignment.
- `completed_at` is set on transition to `DONE` and cleared on transition away from `DONE`.
- `started_at` is set on first transition to `IN_PROGRESS`.
- Unblocking (`is_blocked=false`) clears `blocked_reason`.

Validation/conflict semantics:
- `400 BUSINESS_RULE_VIOLATION` when setting `blocked_reason` while `is_blocked` is false
- `400 BUSINESS_RULE_VIOLATION` when moving a blocked task to `DONE`
- `409 CONFLICT` when changing `story_id` to a story in a different project

Update response `meta` includes story progress counters when the task belongs to a story.

#### Assignment change event ledger

Story/task assignee changes persist a durable planning event in `activity_log`:
- `event_name`: `planning.assignment.changed`
- `entity_type`: `story` or `task`
- `metadata_json` payload contract:
  - `work_item_key`
  - `assignee_agent` (`{"id": "<agent_id>"}` or `null`)
  - `previous_assignee` (`{"id": "<agent_id>"}` or `null`)
  - `correlation_id`
  - `causation_id`
  - `timestamp`

No event is emitted when assignee value is unchanged (semantic no-op). Event persistence is transactional with the source assignee state change.

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
  "display_order": 200,    // optional, integer >= 0
  "goal": "...",           // optional
  "start_date": "...",     // optional
  "end_date": "..."        // optional
}
```

`status` defaults to:
- `ACTIVE` for `BACKLOG` and `IDEAS`,
- `OPEN` for `SPRINT` (activate explicitly via `POST /backlogs/{id}/start`).
`display_order` defaults to next free order bucket for the same scope (`project_id` or global).

#### `GET /v1/planning/backlogs` — List backlogs

Query: `project_id`, `project_key`, `status`, `kind`, `sort`, `limit`, `offset`.
Use `project_id=null` to list global backlogs. `project_key` — same behavior as stories (see above).

Default order when `sort` is omitted:
- active sprint first (`kind=SPRINT` and `status=ACTIVE`)
- default backlog last (`is_default=true`)
- remaining backlogs by `display_order ASC` (then `created_at ASC`)

Pinned ordering rules are always applied (active sprint first, default backlog last), even when `sort` is provided.

#### `GET /v1/planning/backlogs/{id}` — Get backlog

Includes story count, task count.

#### `POST /v1/planning/backlogs/{id}/start` — Start sprint

Transitions a sprint backlog from non-active state to `ACTIVE`.

Query: optional `project_id` or `project_key` for project-scope validation.

Response `200`:
```jsonc
{
  "data": { "...backlog fields...", "status": "ACTIVE" },
  "meta": {
    "transition": "START_SPRINT",
    "from_status": "OPEN",
    "to_status": "ACTIVE",
    "story_count": 3,
    "done_story_count": 1,
    "unfinished_story_count": 2,
    "active_sprint_id": "..."
  }
}
```

Validation/business rules:
- `400 BUSINESS_RULE_VIOLATION` if backlog is not a sprint or is already active
- `409 CONFLICT` if another sprint is already active for the same project
- `400 VALIDATION_ERROR` on project-scope mismatch (`project_id`/`project_key`)

Uniqueness constraints (project scope):
- at most one active sprint (`kind=SPRINT`, `status=ACTIVE`) per project
- at most one default backlog (`is_default=true`) per project

#### `POST /v1/planning/backlogs/{id}/complete` — Complete sprint

Transitions an active sprint backlog to `CLOSED`.

Query: optional `project_id` or `project_key` for project-scope validation.

Response `200`:
```jsonc
{
  "data": { "...backlog fields...", "status": "CLOSED" },
  "meta": {
    "transition": "COMPLETE_SPRINT",
    "from_status": "ACTIVE",
    "to_status": "CLOSED",
    "story_count": 3,
    "done_story_count": 3,
    "unfinished_story_count": 0,
    "active_sprint_id": null
  }
}
```

Guardrails:
- `400 BUSINESS_RULE_VIOLATION` when sprint contains unfinished stories (`status != DONE`)
- `400 BUSINESS_RULE_VIOLATION` when sprint is not active
- `400 VALIDATION_ERROR` on project-scope mismatch (`project_id`/`project_key`)

#### `POST /v1/planning/backlogs/{id}/transition-kind` — Transition backlog kind

Transitions backlog `kind` using explicit guardrails.

Query: optional `project_id` or `project_key` for project-scope validation.

Request:
```jsonc
{ "kind": "BACKLOG" } // BACKLOG | SPRINT | IDEAS
```

Response `200`:
```jsonc
{
  "data": { "...backlog fields..." },
  "meta": {
    "transition": "TRANSITION_BACKLOG_KIND",
    "from_kind": "IDEAS",
    "to_kind": "SPRINT",
    "from_status": "ACTIVE",
    "to_status": "OPEN",
    "changed": true
  }
}
```

Guardrails:
- `400 BUSINESS_RULE_VIOLATION` when changing kind of default backlog
- `400 BUSINESS_RULE_VIOLATION` when transitioning global backlog to `SPRINT`
- `400 BUSINESS_RULE_VIOLATION` when transitioning an active sprint to a different kind
- Transitioning to `SPRINT` forces status to `OPEN` (activation must happen via `POST /start`)
- `409 CONFLICT` when transitioning to `BACKLOG` would create a second active product backlog
- `400 VALIDATION_ERROR` on project-scope mismatch (`project_id`/`project_key`)

#### `PATCH /v1/planning/backlogs/{id}` — Update backlog

Updatable: `name`, `display_order`, `goal`, `start_date`, `end_date`, `metadata_json`.

`status` is lifecycle-managed and cannot be changed via generic `PATCH`.
Use:
- `POST /v1/planning/backlogs/{id}/start`
- `POST /v1/planning/backlogs/{id}/complete`

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
Story objects match the active sprint story shape (`id`, `key`, `title`, `status`, `priority`, `story_type`, `position`, `task_count`, `done_task_count`, `assignee_agent_id`, `assignee_name`, `assignee_last_name`, `assignee_initials`, `assignee_avatar`, `labels`, `label_ids`).

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
      "done_task_count": 1,
      "assignee_agent_id": "a1",
      "assignee_name": "Agent",
      "assignee_last_name": "Alpha",
      "assignee_initials": "AA",
      "assignee_avatar": "https://cdn.example.com/agent-1.png",
      "labels": [
        { "id": "...", "name": "bug", "color": "#ff0000" }
      ],
      "label_ids": ["..."]
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
      "display_order": 100,
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
        "position": 0,
        "task_count": 3,
        "done_task_count": 1,
        "assignee_agent_id": "a1",
        "assignee_name": "Agent",
        "assignee_last_name": "Alpha",
        "assignee_initials": "AA",
        "assignee_avatar": "https://cdn.example.com/agent-1.png",
        "labels": [
          { "id": "...", "name": "bug", "color": "#ff0000" }
        ],
        "label_ids": ["..."]
      }
    ]
  }
}
```

Returns `404` if no active sprint exists for the given project.
Returns `422` if `project_id` is missing.

#### `POST /v1/planning/backlogs/active-sprint/stories` — Add story to active sprint

Moves a story from the project's product backlog (`kind=BACKLOG`) to the active sprint.
Operation is idempotent when the story is already in the active sprint.

Query: `project_id` or `project_key` (at least one required).

Request:
```jsonc
{
  "story_id": "...",
  "position": 0 // optional; defaults to first free position in sprint
}
```

Response `200`:
```jsonc
{
  "data": {
    "story_id": "...",
    "project_id": "...",
    "source_backlog_id": "...",
    "target_backlog_id": "...",
    "source_position": 1,
    "target_position": 0,
    "moved": true
  }
}
```

Error behavior:
- `404 NOT_FOUND` when active sprint or story does not exist
- `400 BUSINESS_RULE_VIOLATION` when story is not in product backlog for the project
- `400 VALIDATION_ERROR` when project selector is missing

#### `DELETE /v1/planning/backlogs/active-sprint/stories/{story_id}` — Remove story from active sprint

Moves a story from active sprint back to product backlog.
Operation is idempotent when the story is already in product backlog.

Query: `project_id` or `project_key` (at least one required), `position` (optional target position in product backlog).

Response `200`:
```jsonc
{
  "data": {
    "story_id": "...",
    "project_id": "...",
    "source_backlog_id": "...",
    "target_backlog_id": "...",
    "source_position": 0,
    "target_position": 2,
    "moved": true
  }
}
```

Error behavior:
- `404 NOT_FOUND` when active sprint or story does not exist
- `400 BUSINESS_RULE_VIOLATION` when story is not in active sprint for the project
- `400 VALIDATION_ERROR` when project selector is missing

---

### 4.6) Agents

**Base path:** `/v1/planning/agents`

#### `GET /v1/planning/agents` — List agents

Query: `key`, `openclaw_key`, `is_active`, `source`, `sort`, `limit`, `offset`.

`openclaw_key` is an alias of `key` for compatibility with CLI filtering.

Agent response fields include:
- `id`, `openclaw_key`, `name`, `last_name`, `initials`, `role`, `worker_type`, `avatar`, `is_active`, `source`,
  `metadata_json`, `last_synced_at`, `created_at`, `updated_at`.

`avatar` is optional and accepts:
- `http`/`https` URL, or
- path-like value (for local/static assets), without spaces.

`last_name` is optional text (trimmed, max 200 chars).  
`initials` is optional text (trimmed, uppercased, letters `A-Z` only, max 10 chars).

Create/update payloads accept:
- `avatar` (set string, clear with `null` or empty string),
- `last_name` (set string, clear with `null` or empty string),
- `initials` (set string, clear with `null` or empty string).

Fallback rendering contract (for API consumers):
- if `avatar` is present and loadable, render avatar image,
- else if `initials` is present, render `initials`,
- else if `name` and `last_name` are present, derive initials from both,
- else use first letter of `name`.

#### `POST /v1/planning/agents/sync` — Sync agents from OpenClaw config

Reads OpenClaw agent definitions from server-side `openclaw.json` and applies deterministic upsert/deactivation logic.

Response `200`:

```jsonc
{
  "data": {
    "created": 1,
    "updated": 2,
    "deactivated": 1,
    "unchanged": 4,
    "errors": 0
  }
}
```

Behavior:
- Upserts by `openclaw_key` with `source=openclaw_json`.
- Updates mutable fields (`name`, `last_name`, `initials`, `role`, `worker_type`, `avatar`, `is_active`, `metadata_json`) and `last_synced_at`.
- Deactivates missing `openclaw_json` agents (`is_active=false`); manual agents are untouched.
- Idempotent: re-running with unchanged config does not create/update/deactivate records (timestamps may still refresh per sync policy).

---

### 4.7) Assignments

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

### 4.8) Labels

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

#### `PATCH /v1/planning/labels/{id}` — Update label

Patch fields:

```jsonc
{
  "name": "backend",      // optional, 1..100 chars
  "color": "#22c55e"      // optional, max 20 chars
}
```

Returns `200`.

Errors:
- `404 NOT_FOUND` when label does not exist
- `409 CONFLICT` when new name already exists in the same scope
- `422 UNPROCESSABLE_ENTITY` when payload validation fails (e.g. empty name)

#### `DELETE /v1/planning/labels/{id}` — Delete label

Hard delete. Removes from all story/task associations. Returns `204`.

#### `POST /v1/planning/stories/{id}/labels` — Attach label to story

```jsonc
{ "label_id": "..." }
```

Response `201`:
```jsonc
{
  "data": {
    "story_id": "...",
    "label_id": "..."
  }
}
```

Errors:
- `404 NOT_FOUND` when story does not exist
- `400 VALIDATION_ERROR` when label does not exist
- `409 CONFLICT` when label is already attached

#### `DELETE /v1/planning/stories/{id}/labels/{label_id}` — Detach label from story

Returns `204`.

Errors:
- `404 NOT_FOUND` when story does not exist
- `404 NOT_FOUND` when label is not attached to the story

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

## 6) Orchestration Module — `/v1/orchestration`

### 6.1) Commands

**Base path:** `/v1/orchestration/commands`

#### `POST /v1/orchestration/commands` — Submit orchestration command

Accepts a versioned command envelope, validates taxonomy and metadata, and atomically persists:
- command record (`orchestration_commands`),
- derived accepted event in transactional outbox (`orchestration_outbox`).

Response `202`:
```jsonc
{
  "data": {
    "status": "ACCEPTED",
    "command": {
      "id": "...",
      "kind": "COMMAND",
      "type": "orchestration.run.submit",
      "schema_version": "1.0",
      "occurred_at": "2026-03-08T09:00:00Z",
      "producer": "mc-cli",
      "correlation_id": "corr-123",
      "causation_id": null,
      "payload": { "run_id": "run-123" }
    },
    "outbox_event": {
      "id": "...",
      "kind": "EVENT",
      "type": "orchestration.run.submit.accepted",
      "schema_version": "1.0",
      "occurred_at": "2026-03-08T09:00:00Z",
      "producer": "mc-cli",
      "correlation_id": "corr-123",
      "causation_id": null,
      "payload": {
        "accepted_command_id": "...",
        "accepted_command_type": "orchestration.run.submit",
        "command_payload": { "run_id": "run-123" },
        "delivery": {
          "attempt": 1,
          "max_attempts": 5,
          "next_retry_at": "2026-03-08T09:00:00Z",
          "backoff_seconds": 5
        }
      }
    }
  }
}
```

Request:
```jsonc
{
  "command_type": "orchestration.run.submit",
  "schema_version": "1.0",
  "payload": { "run_id": "run-123" },
  "metadata": {
    "producer": "mc-cli",
    "correlation_id": "corr-123",
    "causation_id": null,
    "occurred_at": "2026-03-08T09:00:00Z"
  }
}
```

Validation rules:
- `command_type` must follow taxonomy `domain.aggregate.action` (lowercase segments),
- `schema_version` must match `<major>.<minor>`,
- supported schema range: `1.0` through `1.1`,
- metadata fields `producer`, `correlation_id`, `occurred_at` are required and non-blank.
- outbox delivery metadata is initialized with bounded retry policy (`attempt=1`, configurable `max_attempts`, exponential `backoff_seconds`).

Validation errors return `400` with machine-actionable `details`:
```jsonc
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Unsupported schema minor version",
    "details": [
      {
        "field": "schema_version",
        "message": "supported minor range is 0-1; got 2"
      }
    ]
  }
}
```

Transactional guarantee:
- command and outbox inserts are performed in one DB transaction,
- on outbox insert failure, command insert is rolled back (no partial write).

### 6.2) Run read model (timeline/attempts/state)

Read endpoints for operational triage and UI/CLI diagnostics.

#### `GET /v1/orchestration/runs` — List run state read models

Query:
- `run_id` (optional exact match)
- `status` (optional: `PENDING|RUNNING|SUCCEEDED|FAILED|CANCELLED`)
- `limit`, `offset`

Response item fields:
- `run_id`, `status`
- `correlation_id`, `causation_id`
- `current_step_id`, `last_event_type`, `run_type`
- `lease_owner`, `lease_token`, `last_heartbeat_at`
- `watchdog_timeout_at`, `watchdog_attempt`, `watchdog_state`
- `terminal_at`, `created_at`, `updated_at`

Ordering/pagination:
- deterministic order: `updated_at DESC`, then `run_id DESC`
- offset-based pagination via `limit`/`offset`

#### `GET /v1/orchestration/runs/{run_id}` — Get single run state

Returns the same shape as list items.  
Returns `404 NOT_FOUND` when run does not exist.

#### `GET /v1/orchestration/timeline` — List timeline events

Query:
- `run_id` (optional exact match)
- `status` (optional run-status filter)
- `event_type` (optional exact match)
- `occurred_after`, `occurred_before` (optional ISO-8601 range)
- `limit`, `offset`

Response item fields:
- `id`, `run_id`, `run_status`
- `step_id`, `message_id`
- `event_type`, `decision`, `reason_code`, `reason_message`
- `correlation_id`, `causation_id`
- `payload`, `occurred_at`, `created_at`
- `is_watchdog_action`, `watchdog_action`

Ordering/pagination:
- deterministic order: `occurred_at DESC`, then `id DESC`
- offset-based pagination via `limit`/`offset`

#### `GET /v1/orchestration/runs/{run_id}/attempts` — List run delivery attempts

Attempts are sourced from outbox rows correlated to the run by `correlation_id`.

Query:
- `limit`, `offset`

Response item fields:
- `outbox_event_id`, `command_id`, `run_id`, `event_type`
- `occurred_at`, `status`
- `retry_attempt`, `max_attempts`, `next_retry_at`
- `dead_lettered_at`, `last_error`
- `correlation_id`, `causation_id`

Returns `404 NOT_FOUND` when run does not exist.

Contract guarantees:
- `correlation_id` and `causation_id` are present in run/timeline/attempt responses
  (causation can be `null` when unavailable by source event).
- filtering is available for run id, run status, event type, and time range.
- pagination order is deterministic and stable for repeated queries.

#### `GET /v1/orchestration/metrics` — Get orchestration health metrics

Returns DEV runtime diagnostics for queue health and failure paths.

Response `200`:
```jsonc
{
  "data": {
    "queue_pending": 2,
    "queue_oldest_pending_age_seconds": 14,
    "retries_total": 6,
    "dead_letter_total": 1,
    "watchdog_interventions": 3,
    "run_latency_avg_ms": 412.5,
    "run_latency_p95_ms": 900.0,
    "generated_at": "2026-03-08T12:00:00Z"
  }
}
```

Field semantics:
- `queue_pending`: outbox rows currently waiting for delivery (`status=PENDING`).
- `queue_oldest_pending_age_seconds`: age of oldest pending outbox item (seconds, nullable when queue empty).
- `retries_total`: outbox rows with `retry_attempt > 1`.
- `dead_letter_total`: outbox rows dead-lettered or marked failed.
- `watchdog_interventions`: accepted timeline entries of `orchestration.watchdog.action`.
- `run_latency_*`: latency distribution over terminal runs (`terminal_at - created_at`, milliseconds).

### 6.3) Dapr bridge endpoints (local runtime)

These endpoints support local runtime event exchange between worker and API via Dapr pub/sub + service invocation.

#### `GET /dapr/subscribe` — Dapr subscription discovery

Returns runtime subscription contract for Dapr sidecar:

```jsonc
[
  {
    "pubsubname": "local-pubsub",
    "topic": "orchestration.events",
    "routes": {
      "default": "v1/orchestration/dapr/events"
    }
  }
]
```

#### `POST /v1/orchestration/dapr/events` — Worker event ingress (via Dapr pub/sub)

Accepts Dapr CloudEvent envelope (or plain JSON fallback), persists the latest run event into Dapr state store (`local-statestore`), then invokes worker ack endpoint through Dapr service invocation:

- state write: `POST /v1.0/state/local-statestore` (through sidecar),
- invocation: `POST /v1.0/invoke/mission-control-worker/method/orchestration/ack` (through sidecar).

Success response `200`:

```jsonc
{
  "status": "SUCCESS",
  "run_id": "local-run-123",
  "occurred_at": "2026-03-08T12:00:00Z"
}
```

Failure mode:
- if state write or worker invocation through Dapr fails, endpoint returns `503` with root-cause details in `detail`.

Trace/correlation handling:
- `correlation_id` is read from event payload (`data.correlation_id`) or CloudEvent `traceid`.
- `causation_id` is read from `data.causation_id`; if absent, `traceparent` is used as fallback.
- extracted `correlation_id`/`causation_id` are propagated into run timeline records and worker ack payload.

#### `GET /healthz/dapr` — Dapr sidecar readiness probe

Checks API-side Dapr metadata endpoint (`/v1.0/metadata`) and returns:

```jsonc
{ "status": "ok" }
```

Failure mode:
- returns `503` when sidecar metadata is unreachable.

---

## Navigation

- ↑ [Docs Index](./INDEX.md)
- ← [Architecture](./ARCHITECTURE.md)
- → [Auth](./AUTH.md)
- → [Status Transitions](./STATUS_TRANSITIONS.md)
- → [Operational Notes](./OPERATIONAL.md)
