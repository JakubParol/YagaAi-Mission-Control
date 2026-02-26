# Workflow Logic — Mission Control (v1 agreed rules)

**Status:** Draft v1.0 (agreed with user)  
**Date:** 2026-02-26  
**Scope:** Application/runtime logic (not pure schema)

## Purpose

This document captures currently agreed workflow behavior for planning and execution.

- `ENTITY_MODEL_V1.md` defines tables/fields.
- This file defines how the app should use those entities.

---

## 1) Project + Backlog Scope

1. Stories/tasks **may exist without project** (`project_id = NULL`) permanently.
2. A project may have one or more named backlogs (including sprint-named backlogs).
3. A global backlog (`project_id = NULL`) exists for ideas/future projects.
4. Global backlog accepts only project-less items (`item.project_id = NULL`).
5. If a project-less item gets assigned to a project, it is auto-removed from global backlog.
6. Story/task can be in **max one backlog at a time**.
7. Story/task can also be in **no backlog** (membership is optional).
8. On project creation, app auto-creates a default project backlog.

---

## 2) Status Model

### Task status

- Allowed statuses: `TODO`, `IN_PROGRESS`, `CODE_REVIEW`, `VERIFY`, `DONE`.
- For v1, task transitions are permissive (app can move between any statuses).

### Story status

- Allowed statuses: `TODO`, `IN_PROGRESS`, `CODE_REVIEW`, `VERIFY`, `DONE`.
- On create: `TODO`.
- If story has no tasks: status is managed manually.
- If story has tasks: status is derived from tasks, with temporary manual override allowed.

Suggested derivation order (when no active override):
1. All tasks `DONE` -> story `DONE`
2. All non-done tasks are at least `VERIFY` -> story `VERIFY`
3. All non-done tasks are at least `CODE_REVIEW` -> story `CODE_REVIEW`
4. All tasks `TODO` -> story `TODO`
5. Otherwise -> story `IN_PROGRESS`

### Epic status

- Epic uses summary workflow: `TODO`, `IN_PROGRESS`, `DONE`.
- If epic has no stories: starts/manual in `TODO`.
- If epic has stories: status is derived from stories, with temporary manual override allowed.

Suggested derivation (when no active override):
1. All stories `DONE` -> epic `DONE`
2. All stories `TODO` -> epic `TODO`
3. Otherwise -> epic `IN_PROGRESS`

### Manual override behavior

- Story/Epic status override is allowed.
- Override automatically expires on next child status change (task change for story, story change for epic).

---

## 3) Blocking Rules (`is_blocked`)

1. `is_blocked` is a separate flag (not a workflow status).
2. Propagation rule: if any child is blocked, parent is blocked.
   - task blocked -> story blocked
   - story blocked -> epic blocked
3. No manual override for `is_blocked` on parent entities.

---

## 4) Assignment Rules

1. One task can have only one active assignee agent at a time.
2. Handoff is supported but manual (no automatic reassignment yet).
3. On task `DONE`, active assignment is auto-closed (`unassigned_at` set).
4. Assignment history is always persisted.

---

## 5) Explicitly Not in v1

1. WIP limits per backlog/sprint.
2. Automatic assignee changes based on status transitions.
3. Multi-assignee active tasks.

---

## Navigation

- ↑ [Documentation Index](./INDEX.md)
- ← [Entity Model v1](./ENTITY_MODEL_V1.md)
- ↑ [README.md](../README.md)
- ↑ [AGENTS.md](../AGENTS.md)
