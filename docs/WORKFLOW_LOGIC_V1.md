# Workflow Logic — Mission Control (v2 — WorkItem model)

**Status:** Active v2.0
**Date:** 2026-03-18
**Scope:** Planning module — application/runtime behavior (entity schema is in `ENTITY_MODEL_V1.md`)

## Purpose

This document defines how the app should behave on top of the v1 entity model.

---

## 1) Project + Backlog Scope

1. Work items may exist without project (`project_id = NULL`) permanently.
2. A project can have multiple backlogs.
3. Global backlog (`project_id = NULL`) is for project-less ideas.
4. Global backlog accepts only project-less items.
5. If a project-less item gets assigned to a project, it is auto-removed from global backlog.
6. A work item can be in max one backlog at a time.
7. A work item can also be in no backlog.
8. On project creation, create one default backlog automatically.

---

## 2) Status Rules

### Allowed status values

- For all work items: `TODO`, `IN_PROGRESS`, `CODE_REVIEW`, `VERIFY`, `DONE`
- For backlogs: `OPEN`, `ACTIVE`, `CLOSED`

### Work item behavior

- Transitions are permissive (no strict transition graph).
- New work items start as `TODO`.
- Status is set directly via PATCH.

### Epic-type derived status

- If epic has no children: stays manual in `TODO`.
- If epic has children: status derived from children, with manual override allowed.
- Manual override on epics is temporary; expires on next child status change.

### Backlog behavior

- Backlog status is lifecycle-managed, not generic-patch managed.
- Newly created sprint backlogs start as `OPEN` and must be started explicitly.
- Backlog list ordering is deterministic:
  - active sprint is always first,
  - default backlog is always last,
  - remaining backlogs are ordered by `rank` (LexoRank, ascending).
- Sprint lifecycle transitions are explicit:
  - `POST /backlogs/{id}/start` (non-active sprint -> `ACTIVE`)
  - `POST /backlogs/{id}/complete` (`ACTIVE` sprint -> `CLOSED`, body requires `target_backlog_id` for non-DONE items)
- Backlog kind transition uses dedicated path (`/backlogs/{id}/transition-kind`) with guardrails.
- Transitioning to `SPRINT` forces backlog status to `OPEN`; activation must happen explicitly via `start`.
- A project can have at most one active sprint and at most one default backlog.

---

## 3) Blocking Rules (`is_blocked`)

1. `is_blocked` is separate from status.
2. Propagation rule: if any child is blocked, parent is blocked (via `parent_id` hierarchy).
3. No manual override for parent `is_blocked`.

---

## 4) Assignment Rules

1. One active assignee per work item at a time.
2. Handoff between agents is manual.
3. On work item `DONE`, active assignment is auto-closed (`unassigned_at` set).
4. Keep full assignment history.

---

## 5) Key Generation Rules

1. Work items use UUID as primary id + optional human key.
2. Human key numbering is shared per project (single project counter).
3. Project-less work items keep `key = NULL`.

---

## 6) Labels, Comments, Attachments

### Labels
- Labels exist globally or per project.
- Labels attach to work items of any type.

### Comments
- Generic comment target: `project/backlog/work_item`.
- Flat comments (no threading).
- Editable (`edited_at`, `edited_by`).
- Hard delete.

### Attachments
- Generic attachment target: `project/backlog/work_item`.
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
