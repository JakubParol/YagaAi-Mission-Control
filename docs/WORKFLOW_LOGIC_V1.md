# Workflow Logic — Mission Control (v1 agreed rules)

**Status:** Draft v1.1 (agreed + defaulted decisions)  
**Date:** 2026-02-26  
**Scope:** Application/runtime behavior (entity schema is in `ENTITY_MODEL_V1.md`)

## Purpose

This document defines how the app should behave on top of the v1 entity model.

---

## 1) Project + Backlog Scope

1. Stories/tasks may exist without project (`project_id = NULL`) permanently.
2. A project can have multiple backlogs.
3. Global backlog (`project_id = NULL`) is for project-less ideas.
4. Global backlog accepts only project-less items.
5. If a project-less item gets assigned to a project, it is auto-removed from global backlog.
6. Story/task can be in max one backlog at a time.
7. Story/task can also be in no backlog.
8. On project creation, create one default backlog automatically.

---

## 2) Status Rules

### Allowed status values

- For tasks/stories: `TODO`, `IN_PROGRESS`, `CODE_REVIEW`, `VERIFY`, `DONE`
- For epics: `TODO`, `IN_PROGRESS`, `DONE`

### Task behavior

- Transitions are permissive in v1 (no strict transition graph yet).

### Story behavior

- New story starts as `TODO`.
- If story has no tasks: status is manual.
- If story has tasks: status is derived from tasks, with manual override allowed.
- If children are mixed, effective parent status defaults to `IN_PROGRESS`.

### Epic behavior

- If epic has no stories: starts manual in `TODO`.
- If epic has stories: status derived from stories, with manual override allowed.

### Override behavior

- Manual override is temporary.
- Override expires on next child status change:
  - story override expires when a task status changes,
  - epic override expires when a story status changes.

---

## 3) Blocking Rules (`is_blocked`)

1. `is_blocked` is separate from status.
2. Propagation rule: if any child is blocked, parent is blocked.
   - task blocked => story blocked
   - story blocked => epic blocked
3. No manual override for parent `is_blocked`.

---

## 4) Assignment Rules

1. One active assignee per task at a time.
2. Handoff between agents is manual.
3. On task `DONE`, active assignment is auto-closed (`unassigned_at` set).
4. Keep full assignment history.

---

## 5) Key Generation Rules

1. Story/task/epic use UUID as primary id + optional human key.
2. Human key numbering is shared per project (single project counter).
3. Project-less stories/tasks keep `key = NULL`.

---

## 6) Labels, Comments, Attachments

### Labels
- Labels exist globally or per project.
- In v1 labels attach only to stories and tasks.

### Comments
- Generic comment target: `project/backlog/epic/story/task`.
- Flat comments (no threading).
- Editable (`edited_at`, `edited_by`).
- Hard delete.

### Attachments
- Generic attachment target: `project/backlog/epic/story/task`.
- One attachment belongs to one entity.
- Store metadata + path/url only (no binary blob in DB).

---

## 7) Activity Log Behavior

1. `activity_log` is append-only.
2. Log only key events in v1 (not full field-level audit yet).
3. Log core planning entities only in v1 (no comments/attachments events for now).
4. Event carries:
   - primary subject (`entity_type`, `entity_id`),
   - context (`project_id`, optional scope ids),
   - actor (`actor_type`, `actor_id`),
   - optional `session_id`/`run_id`,
   - `event_name` + schema-less `event_data_json`.
5. `project_id` is required for project-scoped events; `NULL` only for global events.

---

## 8) Deletion Behavior

1. Core entities are hard-deleted.
2. Cascade delete is allowed for core hierarchy/mappings.
3. Audit data should remain (`activity_log`, status histories), so audit records are preserved even when core entities are deleted.

---

## 9) Deferred to Later Versions

1. WIP limits per backlog/sprint.
2. Multi-assignee active tasks.
3. Full field-level activity/event logging.
4. Automatic assignment rules based on status changes.

---

## Navigation

- ↑ [Documentation Index](./INDEX.md)
- ← [Entity Model v1](./ENTITY_MODEL_V1.md)
- ↑ [README.md](../README.md)
- ↑ [AGENTS.md](../AGENTS.md)
