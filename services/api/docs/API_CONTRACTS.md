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

### 4.2) Work Items

**Base path:** `/v1/planning/work-items`

Work items are polymorphic: `type` discriminator is `EPIC`, `STORY`, `TASK`, or `BUG`.
Work items can be project-less or project-scoped. Hierarchy via `parent_id`.

#### `POST /v1/planning/work-items` — Create work item

Request:
```jsonc
{
  "type": "STORY",            // required: EPIC | STORY | TASK | BUG
  "project_id": "...",        // optional (null = project-less)
  "parent_id": "...",         // optional (e.g. epic for story, story for task)
  "title": "...",             // required
  "sub_type": "USER_STORY",   // optional
  "summary": "...",           // optional
  "description": "...",       // optional
  "priority": 1,              // optional
  "estimate_points": 3.0,     // optional
  "due_at": "2026-03-01T...", // optional
  "current_assignee_agent_id": "..." // optional
}
```

`status` defaults to `TODO`. `key` auto-generated if `project_id` is set.

#### `GET /v1/planning/work-items` — List work items

Query: `type`, `project_id`, `project_key`, `parent_id`, `status`, `is_blocked`, `sub_type`, `current_assignee_agent_id`, `sort`, `limit`, `offset`.

`type` filter returns only items of that type (e.g. `?type=STORY`).

#### `GET /v1/planning/work-items/{id}` — Get work item

Includes: `children_count`, assignments.

#### `PATCH /v1/planning/work-items/{id}` — Update work item

Updatable: `title`, `summary`, `description`, `sub_type`, `status`, `parent_id`, `is_blocked`, `blocked_reason`, `priority`, `estimate_points`, `due_at`, `current_assignee_agent_id`, `metadata_json`.

Side effects:
- Status change to `DONE` auto-closes active assignment.
- `completed_at` set on `DONE`, cleared on transition away.
- `started_at` set on first `IN_PROGRESS`.
- Unblocking clears `blocked_reason`.

#### `DELETE /v1/planning/work-items/{id}` — Delete work item

Hard delete. Cascades to children. Returns `204`.

#### `POST /v1/planning/work-items/{id}/status` — Quick status change

Request: `{ "status": "IN_PROGRESS" }`

Response: `{ work_item_id, from_status, to_status, changed, actor_id, timestamp }`

#### `POST /v1/planning/work-items/{id}/labels` — Attach label

Request: `{ "label_id": "..." }`

#### `DELETE /v1/planning/work-items/{id}/labels/{label_id}` — Detach label

#### `POST /v1/planning/work-items/{id}/assignments` — Assign agent

Request: `{ "agent_id": "...", "reason": "..." }`

#### `DELETE /v1/planning/work-items/{id}/assignments/current` — Unassign

#### `GET /v1/planning/work-items/{id}/assignments` — List assignment history

#### `GET /v1/planning/work-items/overview` — Work item overview aggregate

Query: `type=EPIC`, plus filters `project_id`, `project_key`, `status`, `owner`, `is_blocked`, `label`, `text`, `sort`, `limit`, `offset`.

Response item fields: `work_item_key`, `title`, `type`, `status`, `progress_pct`, `progress_trend_7d`, `children_total`, `children_done`, `children_in_progress`, `blocked_count`, `stale_days`, `priority`, `updated_at`.

#### `POST /v1/planning/work-items/bulk/status` — Bulk update status

Request: `{ "work_item_ids": ["id1", "id2"], "status": "DONE" }`

Response: per-record outcome with `operation`, `total`, `succeeded`, `failed`, `results[]`.

#### `POST /v1/planning/work-items/bulk/active-sprint/add` — Bulk add to active sprint

Query: `project_id` or `project_key` (required).

Request: `{ "work_item_ids": ["id1", "id2"] }`

#### Assignment change event ledger

Work item assignee changes persist a durable planning event in `activity_log`:
- `event_name`: `planning.assignment.changed`
- `entity_type`: `work_item`
- `metadata_json` payload: `work_item_key`, `assignee_agent`, `previous_assignee`, `correlation_id`, `causation_id`, `timestamp`.

---

### 4.3) Backlogs

**Base path:** `/v1/planning/backlogs`

Backlogs can be global (`project_id=null`) or project-scoped.

#### `POST /v1/planning/backlogs` — Create backlog

Request:
```jsonc
{
  "project_id": "...",     // optional (null = global)
  "name": "Sprint 1",     // required
  "kind": "SPRINT",       // required: BACKLOG | SPRINT | IDEAS
  "rank": "aaa",            // optional, LexoRank string
  "goal": "...",           // optional
  "start_date": "...",     // optional
  "end_date": "..."        // optional
}
```

`status` defaults to:
- `ACTIVE` for `BACKLOG` and `IDEAS`,
- `OPEN` for `SPRINT` (activate explicitly via `POST /backlogs/{id}/start`).
`rank` defaults to a LexoRank value placing it after existing items in the same scope.

#### `GET /v1/planning/backlogs` — List backlogs

Query: `project_id`, `project_key`, `status`, `kind`, `sort`, `limit`, `offset`.
Use `project_id=null` to list global backlogs. `project_key` — same behavior as stories (see above).

Default order when `sort` is omitted:
- active sprint first (`kind=SPRINT` and `status=ACTIVE`)
- default backlog last (`is_default=true`)
- remaining backlogs by `rank ASC` (then `created_at ASC`)

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

Transitions an active sprint backlog to `CLOSED`. Non-DONE items are moved to the target backlog.

Query: optional `project_id` or `project_key` for project-scope validation.

Request:
```jsonc
{ "target_backlog_id": "..." } // required: where to move non-DONE items
```

Response `200`:
```jsonc
{
  "data": { "...backlog fields...", "status": "CLOSED" },
  "meta": {
    "transition": "COMPLETE_SPRINT",
    "from_status": "ACTIVE",
    "to_status": "CLOSED",
    "item_count": 3,
    "done_item_count": 1,
    "moved_item_count": 2,
    "active_sprint_id": null
  }
}
```

Guardrails:
- `400 BUSINESS_RULE_VIOLATION` when sprint is not active
- `400 VALIDATION_ERROR` when `target_backlog_id` is missing or invalid
- `400 VALIDATION_ERROR` on project-scope mismatch

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

Updatable: `name`, `rank`, `goal`, `start_date`, `end_date`, `metadata_json`.

`status` is lifecycle-managed and cannot be changed via generic `PATCH`.
Use:
- `POST /v1/planning/backlogs/{id}/start`
- `POST /v1/planning/backlogs/{id}/complete`

#### `DELETE /v1/planning/backlogs/{id}` — Delete backlog

Hard delete. Items in the backlog are detached (not deleted). Returns `204`.

#### `POST /v1/planning/backlogs/{id}/items` — Add work item to backlog

```jsonc
{ "work_item_id": "...", "rank": "aaa" } // rank is optional
```

Enforces: work item can be in max one backlog. Global backlog only accepts project-less items.
Returns `200`.

#### `DELETE /v1/planning/backlogs/{id}/items/{work_item_id}` — Remove work item from backlog

Returns `204`.

#### `PATCH /v1/planning/backlogs/{id}/items/{work_item_id}/rank` — Update item rank

```jsonc
{ "rank": "aab" }
```

Returns `200`.

#### `GET /v1/planning/backlogs/{id}/items` — List items in a backlog

Returns work items belonging to the given backlog, ordered by `rank ASC`.

Returns `404` if backlog does not exist.
Returns empty list when backlog has no items.

#### `GET /v1/planning/backlogs/active-sprint` — Get active sprint board

Returns the first active sprint (`kind=SPRINT`, `status=ACTIVE`) for a project, including its items ordered by rank.

Query: `project_id` or `project_key` (at least one required).

Response `200`:
```jsonc
{
  "data": {
    "backlog": { "id": "...", "rank": "aaa", "is_default": false, ... },
    "items": [
      {
        "id": "...",
        "key": "MC-42",
        "title": "Implement board view",
        "type": "STORY",
        "sub_type": "USER_STORY",
        "status": "IN_PROGRESS",
        "priority": 1,
        "parent_id": null,
        "rank": "aaa",
        "children_count": 3,
        "done_children_count": 1,
        "assignee_agent_id": "a1",
        "assignee_name": "Agent",
        "assignee_last_name": "Alpha",
        "assignee_initials": "AA",
        "assignee_avatar": "https://cdn.example.com/agent-1.png",
        "labels": [{ "id": "...", "name": "bug", "color": "#ff0000" }],
        "label_ids": ["..."]
      }
    ]
  }
}
```

Returns `404` if no active sprint exists for the given project.

#### `POST /v1/planning/backlogs/active-sprint/items` — Add work item to active sprint

Moves a work item from the project's product backlog to the active sprint.

Query: `project_id` or `project_key` (at least one required).

Request:
```jsonc
{ "work_item_id": "..." }
```

Response `200`:
```jsonc
{
  "data": {
    "work_item_id": "...",
    "source_backlog_id": "...",
    "target_backlog_id": "...",
    "moved": true
  }
}
```

#### `DELETE /v1/planning/backlogs/active-sprint/items/{work_item_id}` — Remove work item from active sprint

Moves a work item from active sprint back to product backlog.

Query: `project_id` or `project_key` (at least one required).

---

### 4.4) Agents

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

### 4.5) Labels

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

Label attachment to work items is managed via the work items endpoints:
- `POST /v1/planning/work-items/{id}/labels` — Attach label
- `DELETE /v1/planning/work-items/{id}/labels/{label_id}` — Detach label

See section 4.2 Work Items for details.

---

## 5) Observability Module — `/v1/observability`

LLM cost tracking, request browsing, and Langfuse data import.

### Conventions

- Observability endpoints are mostly read-only (GET), except for the import trigger (POST).
- Cost/request data originates from Langfuse and is persisted in Mission Control PostgreSQL storage.

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

## 6) Control Plane Module — `/v1/control-plane`

### 6.1) Commands

**Base path:** `/v1/control-plane/commands`

#### `POST /v1/control-plane/commands` — Submit control-plane command

Accepts a versioned command envelope, validates taxonomy and metadata, and atomically persists:
- command record (`control_plane_commands`),
- derived accepted event in transactional outbox (`control_plane_outbox`).

Response `202`:
```jsonc
{
  "data": {
    "status": "ACCEPTED",
    "command": {
      "id": "...",
      "kind": "COMMAND",
      "type": "control-plane.run.submit",
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
      "type": "control-plane.run.submit.accepted",
      "schema_version": "1.0",
      "occurred_at": "2026-03-08T09:00:00Z",
      "producer": "mc-cli",
      "correlation_id": "corr-123",
      "causation_id": null,
      "payload": {
        "accepted_command_id": "...",
        "accepted_command_type": "control-plane.run.submit",
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
  "command_type": "control-plane.run.submit",
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

#### `GET /v1/control-plane/runs` — List run state read models

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

#### `GET /v1/control-plane/runs/{run_id}` — Get single run state

Returns the same shape as list items.  
Returns `404 NOT_FOUND` when run does not exist.

#### `GET /v1/control-plane/timeline` — List timeline events

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

#### `GET /v1/control-plane/runs/{run_id}/attempts` — List run delivery attempts

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

#### `GET /v1/control-plane/metrics` — Get control-plane health metrics

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
- `watchdog_interventions`: accepted timeline entries of `control-plane.watchdog.action`.
- `run_latency_*`: latency distribution over terminal runs (`terminal_at - created_at`, milliseconds).

### 6.3) Dapr bridge endpoints (local runtime)

These endpoints support local runtime event exchange between worker and API via Dapr pub/sub + service invocation.

#### `GET /dapr/subscribe` — Dapr subscription discovery

Returns runtime subscription contract for Dapr sidecar:

```jsonc
[
  {
    "pubsubname": "local-pubsub",
    "topic": "control-plane.events",
    "routes": {
      "default": "v1/control-plane/dapr/events"
    }
  }
]
```

#### `POST /v1/control-plane/dapr/events` — Worker event ingress (via Dapr pub/sub)

Accepts Dapr CloudEvent envelope (or plain JSON fallback), persists the latest run event into Dapr state store (`local-statestore`), then invokes worker ack endpoint through Dapr service invocation:

- state write: `POST /v1.0/state/local-statestore` (through sidecar),
- invocation: `POST /v1.0/invoke/mission-control-worker/method/control-plane/ack` (through sidecar).

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
- → [Test Strategy](./TEST_STRATEGY.md)
