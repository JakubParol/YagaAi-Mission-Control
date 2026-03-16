# Status Transition Rules — Mission Control API

**Status:** Active
**Applies to:** `services/api` — planning module

---

## 1) Supported status sets

| Entity | Statuses |
|---|---|
| Project | `ACTIVE`, `ARCHIVED` |
| Backlog | `OPEN`, `ACTIVE`, `CLOSED` |
| Story | `TODO`, `IN_PROGRESS`, `CODE_REVIEW`, `VERIFY`, `DONE` |
| Task | `TODO`, `IN_PROGRESS`, `CODE_REVIEW`, `VERIFY`, `DONE` |
| Epic | `TODO`, `IN_PROGRESS`, `DONE` |

---

## 2) Tasks

Current task lifecycle behavior:
- status is set explicitly
- transition to `IN_PROGRESS` sets `started_at` on first start
- transition to `DONE` sets `completed_at`
- transition away from `DONE` clears `completed_at`
- transition to `DONE` closes active assignment state

Guardrails currently enforced:
- blocked task cannot be moved to `DONE`
- `blocked_reason` can only be set when `is_blocked = true`
- clearing `is_blocked` clears `blocked_reason`

---

## 3) Stories

Story status is currently **manual**.
It is not derived from child tasks.

Story write model also supports:
- `is_blocked`
- `blocked_reason`
- assignee change tracking / assignment event emission

---

## 4) Epics

Epic status supports derived behavior from child stories.

Current rule of thumb:
- no child stories → epic can stay effectively manual
- all child stories `TODO` → epic `TODO`
- all child stories `DONE` → epic `DONE`
- mixed child story states → epic `IN_PROGRESS`

Epic records also support manual/blocking metadata on the entity itself, while overview/read models additionally surface child-story blockage signals.

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
- only one active sprint is allowed per project
- only project-scoped backlogs can become sprints
- active sprint membership is managed through dedicated endpoints, not raw backlog patching

---

## 6) Side effects worth remembering

| Trigger | Side effect |
|---|---|
| Task → `IN_PROGRESS` first time | sets `started_at` |
| Task → `DONE` | sets `completed_at`, closes active assignment |
| Task away from `DONE` | clears `completed_at` |
| Story/task assignee change | writes durable assignment-change event ledger entry |
| Sprint start | activates the sprint and establishes active-sprint context for the project |
| Sprint complete | closes the sprint, but only when completion rules pass |

---

## 7) Scope of this document

This file intentionally captures only rules that are visible and important in the current API behavior.
For endpoint payloads and response shapes, use [API Contracts](./API_CONTRACTS.md).

## Navigation

- ↑ [Docs Index](./INDEX.md)
- ← [Auth](./AUTH.md)
- → [API Contracts](./API_CONTRACTS.md)
