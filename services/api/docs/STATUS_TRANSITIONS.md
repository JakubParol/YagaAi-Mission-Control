# Status Transition Rules — Mission Control v1

**Status:** Draft v1.0
**Date:** 2026-02-27
**Applies to:** `services/api` — aligned with [WORKFLOW_LOGIC_V1.md](../../../docs/WORKFLOW_LOGIC_V1.md)

---

## 1) Status Values

| Entity | Allowed statuses |
|---|---|
| Task | `TODO`, `IN_PROGRESS`, `CODE_REVIEW`, `VERIFY`, `DONE` |
| Story | `TODO`, `IN_PROGRESS`, `CODE_REVIEW`, `VERIFY`, `DONE` |
| Epic | `TODO`, `IN_PROGRESS`, `DONE` |
| Backlog | `ACTIVE`, `CLOSED` |
| Project | `ACTIVE`, `ARCHIVED` |

---

## 2) Task Status

- **Permissive transitions in v1**: any status → any status is allowed.
- No transition graph enforcement yet (deferred to v2).
- On transition to `DONE`:
  - `completed_at` is set automatically.
  - Active assignment is auto-closed (`unassigned_at` set).
- On transition away from `DONE`:
  - `completed_at` is cleared.

Validation: reject unknown status values (400).

---

## 3) Story Status (Derived + Override)

| Condition | Behavior |
|---|---|
| Story has **no tasks** | Status is **manual** — set directly via PATCH. |
| Story has **tasks** | Status is **derived** from child tasks (see derivation below). Manual override allowed. |

### Derivation Logic

| Child task states | Derived story status |
|---|---|
| All `TODO` | `TODO` |
| All `DONE` | `DONE` |
| Any mix | `IN_PROGRESS` |

### Override

- Client can PATCH `status` on a derived story → sets `status_override` + `status_override_set_at`.
- Override is **temporary**: cleared on the next child task status change, at which point derivation resumes.
- API response includes both `status` (effective) and `status_mode` (`MANUAL` | `DERIVED`) so clients know the source.

---

## 4) Epic Status (Derived + Override)

Same pattern as stories, one level up:

| Condition | Behavior |
|---|---|
| Epic has **no stories** | Status is **manual**. |
| Epic has **stories** | Status is **derived** from child stories. Override allowed. |

Derivation:

| Child story states | Derived epic status |
|---|---|
| All `TODO` | `TODO` |
| All `DONE` | `DONE` |
| Any mix | `IN_PROGRESS` |

Override expires on next child story status change.

---

## 5) Blocking (`is_blocked`)

- `is_blocked` is independent of status. A task can be `IN_PROGRESS` and blocked.
- Set via PATCH on the entity itself. Optional `blocked_reason` text.
- **Propagation (read-only, computed):**
  - If any child task is blocked → parent story `is_blocked = true` (computed, not stored on parent).
  - If any child story is blocked → parent epic `is_blocked = true` (computed).
- Parent `is_blocked` cannot be manually overridden — it is always derived from children.
- API response for stories/epics should include a computed `is_blocked` reflecting child state.

---

## 6) Side Effects Summary

| Trigger | Side effect |
|---|---|
| Task status → `DONE` | Close active assignment, set `completed_at` |
| Task status away from `DONE` | Clear `completed_at` |
| Task status change (any) | Re-derive parent story status, clear story override |
| Story status change (any) | Re-derive parent epic status, clear epic override |
| Story/task gets `project_id` set | Auto-generate `key`, remove from global backlog |
| Project created | Auto-create default backlog |
| Backlog deleted | Detach items (don't delete them) |

---

## 7) Status History

Every status change on epics, stories, and tasks is recorded in the corresponding `*_status_history` table:

```jsonc
{
  "from_status": "TODO",    // null on creation
  "to_status": "IN_PROGRESS",
  "changed_by": "agent-abc",
  "changed_at": "2026-02-27T...",
  "note": "optional context"
}
```

This is append-only and preserved even after entity deletion.

---

## Navigation

- ↑ [Docs Index](./INDEX.md)
- ← [Auth](./AUTH.md)
- → [Operational Notes](./OPERATIONAL.md)
