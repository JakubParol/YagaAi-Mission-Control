# Audit: Planning UI → API Fitness — 2026-03-18

## Section A: Contract Mismatches

### A1. Board Page

```
✅ [Board] GET /backlogs/active-sprint — verified OK
   Envelope: { data: { backlog, items[] }, meta: {} }
   Items have all expected fields: id, key, title, type, sub_type, status, priority,
   parent_id, parent_key, parent_title, rank, children_count, done_children_count,
   assignee_agent_id, labels[], label_ids[]
   Bonus: API also returns assignee_name, assignee_avatar, assignee_initials, assignee_last_name

✅ [Board] GET /agents?is_active=true — verified OK
   Envelope: { data[], meta: { limit, offset, total } }

✅ [Board] PATCH /work-items/{id} — verified OK (flat response, no data envelope)

✅ [Board] POST /work-items — verified OK (flat response)
```

### A2. Backlog Page

```
✅ [Backlog] GET /backlogs?project_id=...&limit=100 — verified OK
   Each backlog has rank (string) and is_default (boolean)

✅ [Backlog] GET /backlogs/{id}/items — verified OK
   Items have all StoryCardStory fields plus extras: backlog_id, work_item_id, added_at, is_blocked

❌ [Backlog] GET /backlogs/{id}/items — assignee field inconsistency
   Frontend expects: assignee_agent_id
   API returns: BOTH assignee_agent_id AND current_assignee_agent_id
   Impact: Works today but dual fields create confusion. active-sprint items only have
   assignee_agent_id, while work-items list only has current_assignee_agent_id.
   The field name should be unified across all endpoints.

✅ [Backlog] POST /backlogs/{id}/items — verified OK
✅ [Backlog] DELETE /backlogs/{id}/items/{work_item_id} — verified OK
✅ [Backlog] PATCH /backlogs/{id} — verified OK
✅ [Backlog] POST /backlogs/{id}/complete — verified OK
```

### A3. List Page

```
❌ [List] GET /work-items?type=STORY|TASK|EPIC — missing fields
   Frontend expects: children_count, done_children_count, labels[], label_ids[], parent_key, parent_title
   API returns: NONE of these on the /work-items list endpoint
   Impact: HIGH — the list page relies on a client-side join with backlog items
   (which DO have these fields) to compensate. Without the join, stories would
   show no epic name, no labels, no progress bars.

❌ [List] GET /work-items?type=... — assignee field name mismatch
   Frontend expects: assignee_agent_id (used in StoryCardStory type)
   API returns: current_assignee_agent_id (different field name)
   Impact: MED — list-view-model maps current_assignee_agent_id to the view model,
   but the shared StoryCardStory type uses assignee_agent_id. This works because the
   list page does its own mapping, but it's a maintenance trap.

✅ [List] PATCH /work-items/{id} — verified OK (flat response)
```

### A4. Epic Overview

```
✅ [Epics] GET /work-items/overview?type=EPIC — verified OK
   Returns: work_item_key, title, type, status, progress_pct, children_total,
   children_done, children_in_progress, blocked_count, stale_days, priority, updated_at
   Bonus: also returns progress_trend_7d

❌ [Epics] GET /work-items/overview — no id field
   Frontend expects: uses work_item_key to resolve to ID via /by-key/{key}
   API returns: work_item_key but no id
   Impact: MED — forces a waterfall: overview → by-key/{key} → children.
   Adding id to the overview response would eliminate one round-trip.

✅ [Epics] GET /work-items/by-key/{key} — verified OK (flat response)
✅ [Epics] GET /work-items?type=STORY&parent_id=... — verified OK
✅ [Epics] POST /work-items/bulk/status — verified OK
✅ [Epics] POST /work-items/bulk/active-sprint/add — verified OK
```

### A5. Story Detail Dialog

```
✅ [Detail] GET /work-items/{id} — verified OK
   Flat response, has children_count and assignments[]

✅ [Detail] GET /work-items?type=TASK&parent_id={id}&sort=priority — verified OK
✅ [Detail] PATCH /work-items/{id} — verified OK (uses sub_type, summary, parent_id)
✅ [Detail] POST /work-items — verified OK
✅ [Detail] POST /work-items/{id}/labels — verified OK
✅ [Detail] DELETE /work-items/{id}/labels/{label_id} — verified OK
```

### A6. Sprint Membership

```
✅ [Sprint] POST /backlogs/active-sprint/items?project_id=... — verified OK
✅ [Sprint] DELETE /backlogs/active-sprint/items/{id}?project_id=... — verified OK
```

---

## Section B: Wiring Anti-Patterns

### B1. N+1 Backlog Items Fan-out (3 occurrences)

```
🔌 [HIGH] Backlog Page (backlog-page-actions.ts)
   Requests: GET /backlogs → N × GET /backlogs/{id}/items
   Purpose: Load all backlog contents for the backlog management view
   Scale: 1 + N + 1 requests (N = number of backlogs, typically 3-10)
   Suggested API: GET /backlogs?project_id=...&include=items that returns backlogs
   with items[] embedded, in a single response

🔌 [HIGH] List Page (list-page-actions.ts)
   Requests: GET /backlogs → N × GET /backlogs/{id}/items
   Purpose: Enrich work items with labels, parent_key, children_count from backlog items
   Scale: 1 + N requests
   Suggested API: Return labels, parent_key, parent_title, children_count, done_children_count
   directly on GET /work-items response — eliminates need for backlog items entirely

🔌 [MED] Story Detail (story-detail-actions.ts → fetchStoryLabelsFromBacklogs)
   Requests: GET /backlogs → N × GET /backlogs/{id}/items
   Purpose: Find labels for a single story by scanning all backlog items
   Scale: 1 + N requests for ONE story's labels
   Suggested API: GET /work-items/{id} already returns label data — this fallback
   function should be removed if the detail endpoint reliably includes labels
```

### B2. Separate Type Queries

```
🔌 [MED] List Page (list-page-actions.ts)
   Requests: 3 × parallel GET /work-items?type={STORY|TASK|EPIC}
   Purpose: Fetch all work items for the project, separated by type
   Why wasteful: Three HTTP round-trips instead of one; three separate response
   payloads to parse
   Suggested API: GET /work-items?project_id=...&limit=100 (no type filter)
   returns all types, frontend groups client-side — OR a purpose-built
   GET /work-items/list-view?project_id=... that returns pre-grouped data
```

### B3. Client-Side Multi-Way Join

```
🔌 [HIGH] List Page (list-view-model.ts)
   Requests: Stories + Tasks + Epics + Backlogs + N × Backlog Items + Agents
   Purpose: Assemble list rows by joining:
     - Stories × Backlog items (for labels, parent_key, children_count)
     - Stories × Epics (for parent title/key via parent_id)
     - Tasks grouped by parent_id (for per-story progress counts)
   Total calls: 3 + 1 + N + 1 = 5+N requests for a single page load
   Suggested API: GET /work-items/list-view?project_id=... returning pre-joined rows
   with parent_key, parent_title, labels, children_count, done_children_count,
   assignee info — all in one response
```

### B4. Waterfalls

```
🔌 [MED] Board Quick Create (quick-create.ts → createTodoQuickItem)
   Requests: POST /work-items → GET /backlogs?kind=BACKLOG → POST /backlogs/{id}/items
             → POST /backlogs/active-sprint/items
   Purpose: Create a work item and place it in backlog + sprint
   Scale: 4 sequential requests
   Suggested API: POST /work-items with optional backlog_id and sprint=true params
   that handles placement server-side in one transaction

🔌 [MED] Epic Story Preview (epics-page-actions.ts → fetchStoriesPreview)
   Requests: GET /work-items/by-key/{key} → GET /work-items?parent_id={id}
   Purpose: Resolve epic key to ID, then fetch children
   Scale: 2 sequential requests per epic expansion
   Suggested API: Add id to overview response (eliminates first call) OR accept
   parent_key param on /work-items endpoint

🔌 [LOW] Story Form Create (story-form-actions.ts → createStory)
   Requests: POST /work-items → POST /backlogs/{id}/items
   Purpose: Create story then attach to backlog
   Scale: 2 sequential requests
   Suggested API: POST /work-items with backlog_id in body
```

### B5. Sequential Bulk Operations

```
🔌 [MED] Sprint Complete — Move Open Stories (backlog-page-actions.ts → moveOpenStoriesToTarget)
   Requests: for each open story: DELETE /backlogs/active-sprint/items/{id}
             + POST /backlogs/{targetId}/items
   Purpose: Move unfinished stories from completed sprint to target backlog
   Scale: 2N sequential requests (N = number of open stories)
   Suggested API: POST /backlogs/{id}/complete already exists and accepts
   target_backlog_id — verify it handles the move server-side. If it does,
   the client-side loop is dead code.
```

### B6. Redundant Agent Fetches

```
🔌 [LOW] All Pages
   Requests: GET /agents?is_active=true&limit=100&sort=name fetched independently by:
     - Board page (board-page-actions.ts)
     - Backlog page (backlog-page-actions.ts)
     - List page (list-page-actions.ts)
     - Epics overview (epics-page-actions.ts)
   Purpose: Populate assignee dropdowns
   Suggested fix: Client-side shared cache / React context provider that fetches
   once and shares across pages. Not an API issue.
```

---

## Section C: Summary

| Metric | Count |
|---|---|
| **Total endpoints verified** | 25 |
| **Contract mismatches found** | 3 |
| **Wiring anti-patterns found** | 9 (3 HIGH, 4 MED, 2 LOW) |

### Recommended API Changes (Prioritized)

| # | Priority | Change | Eliminates |
|---|----------|--------|------------|
| 1 | **P0** | Enrich `GET /work-items` list response with `labels[]`, `label_ids[]`, `parent_key`, `parent_title`, `children_count`, `done_children_count`, `assignee_agent_id` | N+1 backlog fan-out on List page, client-side joins in list-view-model, separate backlog items fetches for enrichment |
| 2 | **P0** | Add `GET /backlogs?include=items` option to embed items in backlog list response | N+1 backlog fan-out on Backlog page (1+N → 1 request) |
| 3 | **P1** | Unify assignee field name: pick ONE of `assignee_agent_id` or `current_assignee_agent_id` across all endpoints | Field name confusion, mapping bugs |
| 4 | **P1** | Add `id` field to `/work-items/overview` response | Epic story preview waterfall (eliminates by-key lookup) |
| 5 | **P1** | Support `backlog_id` and `add_to_sprint` in `POST /work-items` body | Quick-create waterfall (4 → 1 request) |
| 6 | **P2** | Add `POST /backlogs/{id}/items/bulk` for bulk move/add | Sequential story move loop |
| 7 | **P2** | Accept `parent_key` param on `GET /work-items` | Epic children waterfall |
| 8 | **P2** | Remove `fetchStoryLabelsFromBacklogs` dead code once detail endpoint labels are confirmed reliable | Dead code cleanup |

### Request Count Impact

| Page | Current Requests | After Fixes | Savings |
|---|---|---|---|
| Board | 2 | 2 | — (already efficient) |
| Backlog (10 backlogs) | 12 | 2 | **-83%** |
| List (5 backlogs) | 10 | 2-3 | **-70%** |
| Epics overview | 2 + 2/expand | 2 + 1/expand | **-50% per expand** |
| Story detail | 2 + (1+N fallback) | 2 | **eliminate fallback** |
| Quick create | 4 sequential | 1 | **-75%** |
