# Audit: Planning UI → API Fitness

You are an API integration auditor. Your job is to verify that the Mission Control **web frontend** (`apps/web`) correctly talks to the **new WorkItem API** (`services/api`), and to find every place where the UI makes **multiple requests to assemble what should be a single, coherent response**.

## Context

The planning module just migrated from separate `stories`, `tasks`, `epics` entities to a unified `work_items` table. The old endpoints (`/v1/planning/stories`, `/v1/planning/tasks`, `/v1/planning/epics`) no longer exist. Everything is now under `/v1/planning/work-items` and `/v1/planning/backlogs`.

## Phase 1 — Live API contract verification

For each planning page listed below, **curl the actual API endpoints** the frontend calls and verify the response shape matches what the frontend code expects.

Use the project ID `17dcdfd3-8b65-480f-b254-22835537c6a8` (MC project) and API base `http://127.0.0.1:5001`.

### 1.1 Board page (`apps/web/src/app/planning/board/`)

Source files: `board-page-actions.ts`, `quick-create.ts`, `board-page-derived.ts`

Verify:
- `GET /v1/planning/backlogs/active-sprint?project_id=...` — response has `data.backlog` and `data.items[]`
- Each item in `data.items` has: `id`, `key`, `title`, `type`, `sub_type`, `status`, `priority`, `parent_id`, `parent_key`, `parent_title`, `rank`, `children_count`, `done_children_count`, `assignee_agent_id`, `labels[]`, `label_ids[]`
- `GET /v1/planning/agents?is_active=true&limit=100&sort=name` — returns `data[]` with agent records
- `PATCH /v1/planning/work-items/{id}` — response is a flat WorkItemResponse (no `data` envelope)
- `POST /v1/planning/work-items` — response is flat WorkItemResponse (no `data` envelope)

### 1.2 Backlog page (`apps/web/src/app/planning/backlog/`)

Source files: `backlog-page-actions.ts`, `board-actions.ts`, `backlog-page-derived.ts`

Verify:
- `GET /v1/planning/backlogs?project_id=...&limit=100` — returns `data[]` of backlogs, each with `rank: string`, `is_default: boolean`
- `GET /v1/planning/backlogs/{id}/items` — each item has all StoryCardStory fields: `id`, `key`, `title`, `type`, `sub_type`, `status`, `priority`, `parent_id`, `parent_key`, `parent_title`, `rank`, `children_count`, `done_children_count`, `assignee_agent_id`, `labels[]`, `label_ids[]`
- `POST /v1/planning/backlogs/{id}/items` — body is `{ work_item_id, rank? }`
- `DELETE /v1/planning/backlogs/{id}/items/{work_item_id}`
- `PATCH /v1/planning/backlogs/{id}` — body with `{ rank }` for reordering
- `POST /v1/planning/backlogs/{id}/complete` — body is `{ target_backlog_id }`

### 1.3 List page (`apps/web/src/app/planning/list/`)

Source files: `list-page-actions.ts`, `list-view-model.ts`

Verify:
- `GET /v1/planning/work-items?type=STORY&project_id=...&limit=100&sort=-updated_at`
- `GET /v1/planning/work-items?type=TASK&project_id=...&limit=100&sort=-updated_at`
- `GET /v1/planning/work-items?type=EPIC&project_id=...&limit=100`
- All three return `{ data: [...], meta: {...} }` envelope
- Each item has: `id`, `key`, `title`, `type`, `sub_type`, `status`, `priority`, `parent_id`, `current_assignee_agent_id`, `updated_at`
- `GET /v1/planning/backlogs/{id}/items` — used per backlog for enrichment
- `PATCH /v1/planning/work-items/{id}` — flat response, no `data` envelope

### 1.4 Epic overview (`apps/web/src/app/planning/epics-overview/`)

Source files: `epics-page-actions.ts`, `overview-types.ts`

Verify:
- `GET /v1/planning/work-items/overview?type=EPIC&project_id=...&limit=100&sort=...` — returns `{ data: [...] }` with items having: `work_item_key`, `title`, `type`, `status`, `progress_pct`, `children_total`, `children_done`, `children_in_progress`, `blocked_count`, `stale_days`, `priority`, `updated_at`
- `GET /v1/planning/work-items/by-key/{key}` — flat response, returns work item detail
- `GET /v1/planning/work-items?type=STORY&parent_id=...` — list of children
- `POST /v1/planning/work-items/bulk/status` — body `{ work_item_ids, status }`
- `POST /v1/planning/work-items/bulk/active-sprint/add?project_id=...` — body `{ work_item_ids }`

### 1.5 Story detail dialog (`apps/web/src/components/planning/`)

Source files: `story-detail-actions.ts`, `story-form-actions.ts`

Verify:
- `GET /v1/planning/work-items/{id}` — flat response (no `data` envelope), has `children_count`, `assignments[]`
- `GET /v1/planning/work-items?type=TASK&parent_id={id}&sort=priority` — returns tasks as `data[]`
- `PATCH /v1/planning/work-items/{id}` — body uses `sub_type`, `summary`, `parent_id` (not `story_type`, `intent`, `epic_id`)
- `POST /v1/planning/work-items` — body includes `type: "TASK"`, `parent_id`, `sub_type`, `summary`
- `POST /v1/planning/work-items/{id}/labels` — body `{ label_id }`
- `DELETE /v1/planning/work-items/{id}/labels/{label_id}`

### 1.6 Sprint membership (`apps/web/src/app/planning/`)

Source files: `sprint-membership-actions.ts`, `sprint-lifecycle-actions.ts`

Verify:
- `POST /v1/planning/backlogs/active-sprint/items?project_id=...` — body `{ work_item_id }`
- `DELETE /v1/planning/backlogs/active-sprint/items/{work_item_id}?project_id=...`

## Phase 2 — Find "wiring" anti-patterns (N+1 / waterfall / client-side joins)

This is the most important part. Read the frontend source code for each page and identify every case where **the UI makes multiple sequential or parallel requests to assemble data that should come from one endpoint**.

For each finding, report:
1. **Page** — which view
2. **What it does** — the sequence of requests
3. **Why it's wasteful** — what information is being assembled client-side
4. **Suggested fix** — what the API should return instead (single endpoint, enriched response, etc.)

### Known patterns to look for

| Pattern | Example |
|---|---|
| **N+1 backlog items** | Fetch backlogs list, then `GET /backlogs/{id}/items` for EACH backlog |
| **Client-side parent resolution** | Fetch work items, then separately fetch epics to resolve `parent_id` → `parent_key` |
| **Client-side label resolution** | Fetch work items, then separately fetch labels or iterate backlogs to find labels |
| **Separate type queries** | Three parallel `GET /work-items?type=STORY`, `?type=TASK`, `?type=EPIC` instead of one unified call |
| **Two-step key resolution** | `GET /work-items/by-key/{key}` to get ID, then `GET /work-items?parent_id={id}` to get children |
| **Agents fetched per page** | Every page independently fetches `/agents?is_active=true` |

### Files to audit

Read ALL of these files and trace every `fetch(apiUrl(...))` call:

```
apps/web/src/app/planning/board/board-page-actions.ts
apps/web/src/app/planning/board/quick-create.ts
apps/web/src/app/planning/backlog/backlog-page-actions.ts
apps/web/src/app/planning/backlog/board-actions.ts
apps/web/src/app/planning/list/list-page-actions.ts
apps/web/src/app/planning/epics-overview/epics-page-actions.ts
apps/web/src/app/planning/sprint-membership-actions.ts
apps/web/src/app/planning/sprint-lifecycle-actions.ts
apps/web/src/app/planning/story-actions.ts
apps/web/src/components/planning/story-detail-actions.ts
apps/web/src/components/planning/story-form-actions.ts
```

## Output format

### Section A: Contract mismatches

For each mismatch found:
```
❌ [page] [endpoint]
   Frontend expects: ...
   API returns: ...
   Impact: ...
```

If everything checks out:
```
✅ [page] [endpoint] — verified OK
```

### Section B: Wiring anti-patterns

For each finding:
```
🔌 [severity: HIGH/MED/LOW] [page]
   Requests: GET /a, then N × GET /b/{id}
   Purpose: assemble X from Y
   Suggested API: single GET /a?include=b that returns enriched data
```

### Section C: Summary

- Total endpoints verified: N
- Contract mismatches found: N
- Wiring anti-patterns found: N (H high, M med, L low)
- Recommended API changes (prioritized list)
