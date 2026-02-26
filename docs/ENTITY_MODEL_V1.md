# Entity Model — Mission Control Work Planning (Jira-like, v1)

**Status:** Draft v1.2 (aligned with current decisions)  
**Date:** 2026-02-26  
**Applies to:** Mission Control DB refactor

## Purpose

This document defines the v1 database entity model for planning and executing agent work in OpenClaw.

It supports:
- many projects,
- work beyond coding (research, marketing, operations, etc.),
- assignment of tasks to agents,
- backlogs grouping both stories and tasks,
- global (project-less) work items and project-scoped work items.

---

## Confirmed v1 Decisions (Entity-Level)

- Core hierarchy: `Project -> Epic (optional) -> Story -> Task`.
- Backlog is a container (not a status): can group stories and tasks.
- Stories/tasks may exist permanently without `project_id`.
- `Task -> Story` relation is optional.
- One active assignee per task.
- Shared status set for stories/tasks: `TODO`, `IN_PROGRESS`, `CODE_REVIEW`, `VERIFY`, `DONE`.
- `is_blocked` is a separate flag, not a status.
- Human-readable keys exist, with one shared counter per project.
- For project-less story/task, `key = NULL`.
- Hard delete on core entities; audit data should remain.

---

## Status Model (Stored Values)

### Stories + Tasks
- `TODO`
- `IN_PROGRESS`
- `CODE_REVIEW`
- `VERIFY`
- `DONE`

### Epics
- `TODO`
- `IN_PROGRESS`
- `DONE`

### Backlogs
- `ACTIVE`
- `CLOSED`

> Workflow behavior (derived status, override behavior, etc.) is defined in [WORKFLOW_LOGIC_V1.md](./WORKFLOW_LOGIC_V1.md).

---

## Entities (v1)

| Table | Purpose |
|---|---|
| `projects` | Top-level planning container |
| `project_counters` | Shared key counter per project |
| `epics` | Optional grouping of stories |
| `stories` | User-story level intent/work |
| `tasks` | Executable work items |
| `backlogs` | Named containers (`BACKLOG`, `SPRINT`, `IDEAS`) |
| `backlog_stories` | Story membership in backlog |
| `backlog_tasks` | Task membership in backlog |
| `agents` | Agent catalog synced from `openclaw.json` (+ manual entries) |
| `task_assignments` | Task -> agent assignment history |
| `labels` | Label definitions (global or project-scoped) |
| `story_labels` | Story-label mapping |
| `task_labels` | Task-label mapping |
| `comments` | Comments for project/backlog/epic/story/task |
| `attachments` | File/link metadata for project/backlog/epic/story/task |
| `activity_log` | Append-only key event log for core planning entities |
| `epic_status_history` | Epic status audit history |
| `story_status_history` | Story status audit history |
| `task_status_history` | Task status audit history |

---

## Table Specifications

## 1) `projects`

- `id` TEXT PK (UUID)
- `key` TEXT NOT NULL UNIQUE (e.g. `MC`)
- `name` TEXT NOT NULL
- `description` TEXT NULL
- `status` TEXT NOT NULL (`ACTIVE`/`ARCHIVED`)
- `created_by` TEXT NULL
- `updated_by` TEXT NULL
- `created_at` TEXT NOT NULL (ISO datetime)
- `updated_at` TEXT NOT NULL (ISO datetime)

## 2) `project_counters`

- `project_id` TEXT PK (logical ref to `projects.id`)
- `next_number` INTEGER NOT NULL
- `updated_at` TEXT NOT NULL

Purpose: one shared numeric counter for generating story/task/epic keys per project.

## 3) `epics`

- `id` TEXT PK (UUID)
- `project_id` TEXT NOT NULL
- `key` TEXT NOT NULL (project-scoped human key)
- `title` TEXT NOT NULL
- `description` TEXT NULL
- `status` TEXT NOT NULL (`TODO`/`IN_PROGRESS`/`DONE`)
- `status_mode` TEXT NOT NULL (`MANUAL`/`DERIVED`)
- `status_override` TEXT NULL
- `status_override_set_at` TEXT NULL
- `is_blocked` INTEGER NOT NULL DEFAULT 0
- `blocked_reason` TEXT NULL
- `priority` INTEGER NULL
- `metadata_json` TEXT NULL
- `created_by` TEXT NULL
- `updated_by` TEXT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

Constraint:
- `UNIQUE(project_id, key)`

## 4) `stories`

- `id` TEXT PK (UUID)
- `project_id` TEXT NULL (project-less allowed)
- `epic_id` TEXT NULL
- `key` TEXT NULL (must be NULL when `project_id` is NULL)
- `title` TEXT NOT NULL
- `intent` TEXT NULL
- `description` TEXT NULL
- `story_type` TEXT NOT NULL
- `status` TEXT NOT NULL
- `status_mode` TEXT NOT NULL (`MANUAL`/`DERIVED`)
- `status_override` TEXT NULL
- `status_override_set_at` TEXT NULL
- `is_blocked` INTEGER NOT NULL DEFAULT 0
- `blocked_reason` TEXT NULL
- `priority` INTEGER NULL
- `metadata_json` TEXT NULL
- `created_by` TEXT NULL
- `updated_by` TEXT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL
- `completed_at` TEXT NULL

Constraints:
- partial unique: `UNIQUE(project_id, key)` where `key IS NOT NULL`
- check: `project_id IS NOT NULL OR key IS NULL`

## 5) `tasks`

- `id` TEXT PK (UUID)
- `project_id` TEXT NULL (project-less allowed)
- `story_id` TEXT NULL (optional)
- `key` TEXT NULL (must be NULL when `project_id` is NULL)
- `title` TEXT NOT NULL
- `objective` TEXT NULL
- `task_type` TEXT NOT NULL
- `status` TEXT NOT NULL
- `is_blocked` INTEGER NOT NULL DEFAULT 0
- `blocked_reason` TEXT NULL
- `priority` INTEGER NULL
- `estimate_points` REAL NULL
- `due_at` TEXT NULL
- `current_assignee_agent_id` TEXT NULL
- `metadata_json` TEXT NULL
- `created_by` TEXT NULL
- `updated_by` TEXT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL
- `started_at` TEXT NULL
- `completed_at` TEXT NULL

Constraints:
- partial unique: `UNIQUE(project_id, key)` where `key IS NOT NULL`
- check: `project_id IS NOT NULL OR key IS NULL`

## 6) `backlogs`

- `id` TEXT PK (UUID)
- `project_id` TEXT NULL (`NULL` => global backlog)
- `name` TEXT NOT NULL
- `kind` TEXT NOT NULL (`BACKLOG`/`SPRINT`/`IDEAS`)
- `status` TEXT NOT NULL (`ACTIVE`/`CLOSED`)
- `is_default` INTEGER NOT NULL DEFAULT 0
- `goal` TEXT NULL
- `start_date` TEXT NULL
- `end_date` TEXT NULL
- `metadata_json` TEXT NULL
- `created_by` TEXT NULL
- `updated_by` TEXT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

Constraint:
- one default backlog per project: partial unique on `project_id` where `is_default = 1`

## 7) `backlog_stories`

- `backlog_id` TEXT NOT NULL
- `story_id` TEXT NOT NULL
- `position` INTEGER NOT NULL
- `added_at` TEXT NOT NULL

Constraints:
- `PRIMARY KEY(backlog_id, story_id)`
- `UNIQUE(story_id)` (story in max one backlog at a time)

## 8) `backlog_tasks`

- `backlog_id` TEXT NOT NULL
- `task_id` TEXT NOT NULL
- `position` INTEGER NOT NULL
- `added_at` TEXT NOT NULL

Constraints:
- `PRIMARY KEY(backlog_id, task_id)`
- `UNIQUE(task_id)` (task in max one backlog at a time)

## 9) `agents`

- `id` TEXT PK (UUID)
- `openclaw_key` TEXT NOT NULL UNIQUE
- `name` TEXT NOT NULL
- `role` TEXT NULL
- `worker_type` TEXT NULL
- `is_active` INTEGER NOT NULL
- `source` TEXT NOT NULL (`openclaw_json`/`manual`)
- `metadata_json` TEXT NULL
- `last_synced_at` TEXT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

## 10) `task_assignments`

- `id` TEXT PK (UUID)
- `task_id` TEXT NOT NULL
- `agent_id` TEXT NOT NULL
- `assigned_at` TEXT NOT NULL
- `unassigned_at` TEXT NULL
- `assigned_by` TEXT NULL
- `reason` TEXT NULL

Constraint:
- one active assignment per task: partial unique on `task_id` where `unassigned_at IS NULL`

## 11) `labels`

- `id` TEXT PK (UUID)
- `project_id` TEXT NULL (`NULL` => global label)
- `name` TEXT NOT NULL
- `color` TEXT NULL
- `created_at` TEXT NOT NULL

Constraints:
- unique project label name: `UNIQUE(project_id, name)` when `project_id IS NOT NULL`
- unique global label name: `UNIQUE(name)` when `project_id IS NULL`

## 12) `story_labels`

- `story_id` TEXT NOT NULL
- `label_id` TEXT NOT NULL
- `added_at` TEXT NOT NULL

Constraint:
- `PRIMARY KEY(story_id, label_id)`

## 13) `task_labels`

- `task_id` TEXT NOT NULL
- `label_id` TEXT NOT NULL
- `added_at` TEXT NOT NULL

Constraint:
- `PRIMARY KEY(task_id, label_id)`

## 14) `comments`

- `id` TEXT PK (UUID)
- `project_id` TEXT NULL (denormalized context)
- `entity_type` TEXT NOT NULL (`project`/`backlog`/`epic`/`story`/`task`)
- `entity_id` TEXT NOT NULL
- `body` TEXT NOT NULL
- `created_by` TEXT NULL
- `created_at` TEXT NOT NULL
- `edited_by` TEXT NULL
- `edited_at` TEXT NULL

Notes:
- flat comments (no threading in v1)
- hard delete (no soft-delete columns)

## 15) `attachments`

- `id` TEXT PK (UUID)
- `project_id` TEXT NULL (denormalized context)
- `entity_type` TEXT NOT NULL (`project`/`backlog`/`epic`/`story`/`task`)
- `entity_id` TEXT NOT NULL
- `filename` TEXT NOT NULL
- `content_type` TEXT NULL
- `size_bytes` INTEGER NULL
- `storage_url` TEXT NULL
- `file_path` TEXT NULL
- `metadata_json` TEXT NULL
- `created_by` TEXT NULL
- `created_at` TEXT NOT NULL

Notes:
- one attachment belongs to exactly one entity
- DB stores metadata/path only (no BLOB in v1)

## 16) `activity_log`

- `id` TEXT PK (UUID)
- `project_id` TEXT NULL (required for project-scoped events, NULL only for global)
- `entity_type` TEXT NOT NULL (primary subject type)
- `entity_id` TEXT NOT NULL (primary subject id)
- `epic_id` TEXT NULL
- `story_id` TEXT NULL
- `task_id` TEXT NULL
- `backlog_id` TEXT NULL
- `actor_type` TEXT NOT NULL (`human`/`agent`/`system`)
- `actor_id` TEXT NULL
- `session_id` TEXT NULL
- `run_id` TEXT NULL
- `event_name` TEXT NOT NULL (e.g. `task.status.changed`)
- `message` TEXT NULL
- `event_data_json` TEXT NULL (schema-less JSON)
- `created_at` TEXT NOT NULL

Notes:
- append-only
- v1 scope: key events for core planning entities only (not comments/attachments)

## 17) `epic_status_history`

- `id` TEXT PK (UUID)
- `project_id` TEXT NULL
- `epic_id` TEXT NOT NULL (logical reference)
- `from_status` TEXT NULL
- `to_status` TEXT NOT NULL
- `changed_by` TEXT NULL
- `changed_at` TEXT NOT NULL
- `note` TEXT NULL

## 18) `story_status_history`

- `id` TEXT PK (UUID)
- `project_id` TEXT NULL
- `story_id` TEXT NOT NULL (logical reference)
- `from_status` TEXT NULL
- `to_status` TEXT NOT NULL
- `changed_by` TEXT NULL
- `changed_at` TEXT NOT NULL
- `note` TEXT NULL

## 19) `task_status_history`

- `id` TEXT PK (UUID)
- `project_id` TEXT NULL
- `task_id` TEXT NOT NULL (logical reference)
- `from_status` TEXT NULL
- `to_status` TEXT NOT NULL
- `changed_by` TEXT NULL
- `changed_at` TEXT NOT NULL
- `note` TEXT NULL

---

## Relationship Highlights

- `project` has many `epics`, `stories`, `tasks`, `backlogs`.
- `epic` has many `stories`.
- `story` has many `tasks` (optional relation).
- `backlog` can include many stories and many tasks.
- one story/task can belong to at most one backlog at a time.
- one task can have at most one active assignment.
- labels apply to stories/tasks only in v1.

---

## Deletion & Audit Policy

### Core entities
- hard delete is allowed.
- cascade is allowed on core hierarchy/mapping tables.

### Audit entities (`activity_log`, `*_status_history`)
- audit records should remain after core entity deletion.
- therefore, audit tables use logical references (`entity_id` fields) and should avoid destructive FK cascades to core records.

---

## Remaining Open Questions

1. Add WIP limits in v2?
2. Add multi-assignee tasks in future versions?
3. Expand `activity_log` from key events to full field-level logging?

---

## Navigation

- ↑ [Documentation Index](./INDEX.md)
- → [Workflow Logic v1](./WORKFLOW_LOGIC_V1.md)
- ↑ [README.md](../README.md)
- ↑ [AGENTS.md](../AGENTS.md)
