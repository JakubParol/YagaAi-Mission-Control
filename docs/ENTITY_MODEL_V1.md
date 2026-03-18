# Entity Model — Mission Control Work Planning (v2 — WorkItem)

**Status:** Active v2.0
**Date:** 2026-03-18
**Applies to:** Mission Control — planning module (shared between `apps/web` and `services/api`)

## Purpose

This document defines the v2 database entity model for planning and executing agent work in OpenClaw.

It supports:
- many projects,
- work beyond coding (research, marketing, operations, etc.),
- assignment of work items to agents,
- backlogs grouping work items of any type,
- global (project-less) work items and project-scoped work items.

---

## Confirmed v2 Decisions (Entity-Level)

- Core entity: `work_items` — polymorphic table with `type` discriminator (`EPIC`, `STORY`, `TASK`, `BUG`).
- Hierarchy via `parent_id`: `Project -> Epic (optional) -> Story/Bug -> Task`.
- Backlog is a container (not a status): can group any work item.
- Work items may exist permanently without `project_id`.
- Parent-child relation is optional (`parent_id` nullable).
- One active assignee per work item.
- Shared status set: `TODO`, `IN_PROGRESS`, `CODE_REVIEW`, `VERIFY`, `DONE`.
- `is_blocked` is a separate flag, not a status.
- Human-readable keys exist, with one shared counter per project.
- For project-less work items, `key = NULL`.
- Hard delete on core entities; audit data should remain.

---

## Status Model (Stored Values)

### Work Items (all types)
- `TODO`
- `IN_PROGRESS`
- `CODE_REVIEW`
- `VERIFY`
- `DONE`

### Backlogs
- `OPEN`
- `ACTIVE`
- `CLOSED`

> Workflow behavior (derived status, override behavior, etc.) is defined in [WORKFLOW_LOGIC_V1.md](./WORKFLOW_LOGIC_V1.md).

---

## Entities (v2)

| Table | Purpose |
|---|---|
| `projects` | Top-level planning container |
| `project_counters` | Shared key counter per project |
| `work_items` | Polymorphic work entity (`EPIC`, `STORY`, `TASK`, `BUG`) |
| `backlogs` | Named containers (`BACKLOG`, `SPRINT`, `IDEAS`) |
| `backlog_items` | Work item membership in backlog |
| `agents` | Agent catalog synced from `openclaw.json` (+ manual entries) |
| `work_item_assignments` | Work item -> agent assignment history |
| `labels` | Label definitions (global or project-scoped) |
| `work_item_labels` | Work item-label mapping |
| `comments` | Comments for project/backlog/work_item |
| `attachments` | File/link metadata for project/backlog/work_item |
| `activity_log` | Append-only key event log for core planning entities |
| `work_item_status_history` | Work item status audit history |

---

## Table Specifications

## 1) `projects`

- `id` TEXT PK (UUID)
- `key` TEXT NOT NULL UNIQUE (e.g. `MC`)
- `name` TEXT NOT NULL
- `description` TEXT NULL
- `status` TEXT NOT NULL (`ACTIVE`/`ARCHIVED`)
- `is_default` BOOLEAN NOT NULL DEFAULT false
- `repo_root` TEXT NULL (absolute path to the project's local repository root)
- `created_by` TEXT NULL
- `updated_by` TEXT NULL
- `created_at` TEXT NOT NULL (ISO datetime)
- `updated_at` TEXT NOT NULL (ISO datetime)

Constraint:
- at most one default project: partial unique on `is_default` where `is_default = 1`

## 2) `project_counters`

- `project_id` TEXT PK (logical ref to `projects.id`)
- `next_number` INTEGER NOT NULL
- `updated_at` TEXT NOT NULL

Purpose: one shared numeric counter for generating story/task/epic keys per project.

## 3) `work_items`

- `id` TEXT PK (UUID)
- `type` TEXT NOT NULL (`EPIC`/`STORY`/`TASK`/`BUG`)
- `project_id` TEXT NULL (project-less allowed)
- `parent_id` TEXT NULL (self-referencing FK for hierarchy)
- `key` TEXT NULL (must be NULL when `project_id` is NULL)
- `title` TEXT NOT NULL
- `sub_type` TEXT NULL (e.g. `USER_STORY`, `SPIKE`, `CHORE`, `CODING`, etc.)
- `summary` TEXT NULL (replaces old `intent`/`objective`)
- `description` TEXT NULL
- `status` TEXT NOT NULL (`TODO`/`IN_PROGRESS`/`CODE_REVIEW`/`VERIFY`/`DONE`)
- `status_mode` TEXT NOT NULL DEFAULT `MANUAL` (`MANUAL`/`DERIVED`)
- `status_override` TEXT NULL
- `is_blocked` BOOLEAN NOT NULL DEFAULT false
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

## 4) `backlogs`

- `id` TEXT PK (UUID)
- `project_id` TEXT NULL (`NULL` => global backlog)
- `name` TEXT NOT NULL
- `kind` TEXT NOT NULL (`BACKLOG`/`SPRINT`/`IDEAS`)
- `status` TEXT NOT NULL (`OPEN`/`ACTIVE`/`CLOSED`)
- `rank` TEXT NOT NULL (LexoRank string for ordering within project/global scope)
- `is_default` BOOLEAN NOT NULL DEFAULT false
- `goal` TEXT NULL
- `start_date` TEXT NULL
- `end_date` TEXT NULL
- `metadata_json` TEXT NULL
- `created_by` TEXT NULL
- `updated_by` TEXT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

Constraint:
- one default backlog per project: partial unique on `project_id` where `project_id IS NOT NULL AND is_default = 1`
- one active sprint per project: partial unique on `project_id` where `project_id IS NOT NULL AND kind = 'SPRINT' AND status = 'ACTIVE'`

## 5) `backlog_items`

- `backlog_id` TEXT NOT NULL
- `work_item_id` TEXT NOT NULL
- `rank` TEXT NOT NULL (LexoRank string)
- `added_at` TEXT NOT NULL

Constraints:
- `PRIMARY KEY(backlog_id, work_item_id)`
- `UNIQUE(work_item_id)` (work item in max one backlog at a time)

## 6) `agents`

- `id` TEXT PK (UUID)
- `openclaw_key` TEXT NOT NULL UNIQUE
- `name` TEXT NOT NULL
- `last_name` TEXT NULL
- `initials` TEXT NULL
- `role` TEXT NULL
- `worker_type` TEXT NULL
- `avatar` TEXT NULL
- `is_active` INTEGER NOT NULL
- `source` TEXT NOT NULL (`openclaw_json`/`manual`)
- `metadata_json` TEXT NULL
- `last_synced_at` TEXT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

## 7) `work_item_assignments`

- `id` TEXT PK (UUID)
- `work_item_id` TEXT NOT NULL
- `agent_id` TEXT NOT NULL
- `assigned_at` TEXT NOT NULL
- `unassigned_at` TEXT NULL
- `assigned_by` TEXT NULL
- `reason` TEXT NULL

Constraint:
- one active assignment per work item: partial unique on `work_item_id` where `unassigned_at IS NULL`

## 8) `labels`

- `id` TEXT PK (UUID)
- `project_id` TEXT NULL (`NULL` => global label)
- `name` TEXT NOT NULL
- `color` TEXT NULL
- `created_at` TEXT NOT NULL

Constraints:
- unique project label name: `UNIQUE(project_id, name)` when `project_id IS NOT NULL`
- unique global label name: `UNIQUE(name)` when `project_id IS NULL`

## 9) `work_item_labels`

- `work_item_id` TEXT NOT NULL
- `label_id` TEXT NOT NULL
- `added_at` TEXT NOT NULL

Constraint:
- `PRIMARY KEY(work_item_id, label_id)`

## 10) `comments`

- `id` TEXT PK (UUID)
- `project_id` TEXT NULL (denormalized context)
- `entity_type` TEXT NOT NULL (`project`/`backlog`/`work_item`)
- `entity_id` TEXT NOT NULL
- `body` TEXT NOT NULL
- `created_by` TEXT NULL
- `created_at` TEXT NOT NULL
- `edited_by` TEXT NULL
- `edited_at` TEXT NOT NULL

Notes:
- flat comments (no threading)
- hard delete (no soft-delete columns)

## 11) `attachments`

- `id` TEXT PK (UUID)
- `project_id` TEXT NULL (denormalized context)
- `entity_type` TEXT NOT NULL (`project`/`backlog`/`work_item`)
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
- DB stores metadata/path only (no BLOB)

## 12) `activity_log`

- `id` TEXT PK (UUID)
- `project_id` TEXT NULL (required for project-scoped events, NULL only for global)
- `entity_type` TEXT NOT NULL (primary subject type)
- `entity_id` TEXT NOT NULL (primary subject id)
- `work_item_id` TEXT NULL
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
- key events for core planning entities only (not comments/attachments)

## 13) `work_item_status_history`

- `id` TEXT PK (UUID)
- `project_id` TEXT NULL
- `work_item_id` TEXT NOT NULL (logical reference)
- `from_status` TEXT NULL
- `to_status` TEXT NOT NULL
- `changed_by` TEXT NULL
- `changed_at` TEXT NOT NULL
- `note` TEXT NULL

---

## Relationship Highlights

- `project` has many `work_items` and `backlogs`.
- Work item hierarchy via `parent_id`: epic → story/bug → task.
- `backlog` can include many work items of any type.
- One work item can belong to at most one backlog at a time.
- One work item can have at most one active assignment.
- Labels apply to work items.

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
