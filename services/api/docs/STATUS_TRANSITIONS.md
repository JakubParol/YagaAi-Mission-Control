# Status Transition Rules — Mission Control API

**Status:** Active
**Applies to:** `services/api` — planning module

---

## 1) Supported status sets

| Entity | Statuses |
|---|---|
| Project | `ACTIVE`, `ARCHIVED` |
| Backlog | `OPEN`, `ACTIVE`, `CLOSED` |
| Work Item (all types) | `TODO`, `IN_PROGRESS`, `CODE_REVIEW`, `VERIFY`, `DONE` |

---

## 2) Work Items

All work item types (`EPIC`, `STORY`, `TASK`, `BUG`) share the same lifecycle:
- status is set explicitly
- transition to `IN_PROGRESS` sets `started_at` on first start
- transition to `DONE` sets `completed_at`
- transition away from `DONE` clears `completed_at`
- transition to `DONE` closes active assignment state

Guardrails currently enforced:
- blocked work item cannot be moved to `DONE`
- `blocked_reason` can only be set when `is_blocked = true`
- clearing `is_blocked` clears `blocked_reason`

## 3) Epic-type derived status

Epic-type work items support derived status from children:
- no children → stays manual
- all children `TODO` → `TODO`
- all children `DONE` → `DONE`
- mixed → `IN_PROGRESS`

Manual override is temporary; expires on next child status change.

---

## 5) Backlogs and sprints

Backlog lifecycle is explicit:
- generic backlog updates do **not** own sprint lifecycle transitions
- sprint start uses `POST /backlogs/{id}/start`
- sprint completion uses `POST /backlogs/{id}/complete`

Important current behavior:
- creating or converting a backlog to `SPRINT` puts it into `OPEN`
- an active sprint uses `ACTIVE`
- completed sprint uses `CLOSED`
- sprint completion requires `target_backlog_id` body — non-DONE items are moved to that backlog
- only one active sprint is allowed per project
- only project-scoped backlogs can become sprints
- active sprint membership is managed through dedicated endpoints, not raw backlog patching

---

## 6) Side effects worth remembering

| Trigger | Side effect |
|---|---|
| Work item → `IN_PROGRESS` first time | sets `started_at` |
| Work item → `DONE` | sets `completed_at`, closes active assignment |
| Work item away from `DONE` | clears `completed_at` |
| Work item assignee change | writes durable assignment-change event ledger entry |
| Sprint start | activates the sprint and establishes active-sprint context for the project |
| Sprint complete | moves non-DONE items to target backlog, closes the sprint |

---

## 7) Scope of this document

This file intentionally captures only rules that are visible and important in the current API behavior.
For endpoint payloads and response shapes, use [API Contracts](./API_CONTRACTS.md).

## Navigation

- ↑ [Docs Index](./INDEX.md)
- ← [Auth](./AUTH.md)
- → [API Contracts](./API_CONTRACTS.md)
