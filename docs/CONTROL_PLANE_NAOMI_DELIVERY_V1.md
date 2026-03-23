# Control Plane Naomi Delivery V1

Naomi-first delivery contract for the first real specialist-execution vertical slice in Mission Control.

This document supplements:
- [CONTROL_PLANE_V1.md](./CONTROL_PLANE_V1.md)
- Epic `MC-565`
- Story `MC-568` — dispatch contract into OpenClaw
- Story `MC-569` — runtime callback / milestone contract back into Mission Control

## Purpose

Define the **practical v1 contract** for:
- how Mission Control dispatches a queued story to Naomi,
- how Naomi reports runtime milestones back,
- which state transitions are authoritative,
- which data James and operators can trust.

This is intentionally **Naomi-only** and **one-shot first**.
It is not a generic multi-agent orchestration framework.

## Scope

Included in v1:
- `TODO` story/bug assigned to Naomi enters runtime queue,
- Naomi capacity = 1 active story,
- oldest queued item is dispatched,
- dispatch uses a structured one-shot OpenClaw contract,
- Naomi reports explicit runtime milestones back to Mission Control,
- watchdog can reason about no-ack and stale execution.

Explicitly out of scope here:
- multi-agent balancing,
- parallel execution inside one story,
- transcript scraping as the primary runtime signal source,
- Discord thread spawning as the execution foundation.

## Operator launch prompts for Claude CLI

Short prompts for manual starts from repo root:

- `[MC-566] [E2E] Implement only this story. Build Naomi queue ingress from Planning assignment into Control Plane runtime state. Keep planning status unchanged on assignment. Naomi-only, no legacy orchestration revival. Read docs/CONTROL_PLANE_V1.md and docs/CONTROL_PLANE_NAOMI_DELIVERY_V1.md first.`
- `[MC-567] [E2E] Implement only this story. Add Naomi capacity=1 FIFO dispatch selection from queued runtime items. Persist runtime transitions and do not dispatch while Naomi already has active work. Read docs/CONTROL_PLANE_V1.md and docs/CONTROL_PLANE_NAOMI_DELIVERY_V1.md first.`
- `[MC-568] [E2E] Implement only this story. Build the Naomi one-shot OpenClaw dispatch adapter using the runtime contract in docs/CONTROL_PLANE_NAOMI_DELIVERY_V1.md. Persist returned session/runtime metadata. Do not route through James as hot path.`
- `[MC-569] [E2E] Implement only this story. Add Naomi runtime callback contract from docs/CONTROL_PLANE_NAOMI_DELIVERY_V1.md: explicit milestone events, correlation fields, and state updates. Do not rely on transcript scraping as the primary source of truth.`
- `[MC-570] [E2E] Implement only this story. Apply Naomi runtime acceptance/blocker/completion outcomes back into planning state and free the next queue slot. Use docs/CONTROL_PLANE_NAOMI_DELIVERY_V1.md as the state-mapping reference.`
- `[MC-571] [E2E] Implement only this story. Add Naomi watchdog handling for ack timeout, stale execution, retry scheduling, and terminal failure using docs/CONTROL_PLANE_NAOMI_DELIVERY_V1.md as the contract baseline.`
- `[MC-572] [E2E] Implement only this story. Expose real read models for Naomi active work, queue, last update, and blocker state. Do not build this from mock-only assumptions; use runtime identifiers from docs/CONTROL_PLANE_NAOMI_DELIVERY_V1.md.`

## Delivery flow at a glance

Planning -> Control Plane queue -> OpenClaw dispatch -> Naomi executes -> Naomi emits runtime milestones -> Control Plane updates state -> James/operator reads clean state

## Dispatch contract: Mission Control -> OpenClaw -> Naomi

## Dispatch intent

Mission Control dispatches exactly one active story to Naomi when:
- the work item is eligible,
- Naomi has no active story,
- the item is the oldest queued Naomi entry.

## Required dispatch fields

The v1 dispatch envelope should include at least:
- `run_id`
- `correlation_id`
- `causation_id`
- `agent_id` = `naomi`
- `work_item_id`
- `work_item_key`
- `work_item_title`
- `project_key` = `MC`
- `repo_root`
- `work_dir`
- `prompt_marker` = `[MC-XXX] [E2E]`
- `contract_version` = `control-plane-naomi-delivery-v1`
- `contract_doc_path` = `/home/kuba/repos/mission-control/docs/CONTROL_PLANE_NAOMI_DELIVERY_V1.md`

## Dispatch payload example

```json
{
  "run_id": "cp-naomi-run-000123",
  "correlation_id": "corr-000123",
  "causation_id": "agent.assignment.dispatched:000123",
  "agent_id": "naomi",
  "work_item_id": "79d85c10-a247-4529-bda5-2faed8eed082",
  "work_item_key": "MC-568",
  "work_item_title": "Send a one-shot [MC-XXX] [E2E] delivery contract to Naomi through OpenClaw",
  "project_key": "MC",
  "repo_root": "/home/kuba/repos/mission-control",
  "work_dir": "/home/kuba/repos/mission-control",
  "prompt_marker": "[MC-568] [E2E]",
  "contract_version": "control-plane-naomi-delivery-v1",
  "contract_doc_path": "/home/kuba/repos/mission-control/docs/CONTROL_PLANE_NAOMI_DELIVERY_V1.md"
}
```

## Runtime event contract: Naomi -> Mission Control

## Design rule

**Explicit events beat transcript inference.**
Mission Control should treat explicit runtime callbacks as the primary source of truth for Naomi execution state.

## Event envelope (required)

Every Naomi runtime callback should include:
- `event_type`
- `schema_version`
- `occurred_at`
- `producer`
- `run_id`
- `correlation_id`
- `causation_id`
- `agent_id`
- `work_item_id`
- `work_item_key`
- `payload`

Recommended fixed values:
- `schema_version = "1.0"`
- `producer = "naomi"`
- `agent_id = "naomi"`

## Generic event example

```json
{
  "event_type": "agent.execution.started",
  "schema_version": "1.0",
  "occurred_at": "2026-03-23T11:30:00Z",
  "producer": "naomi",
  "run_id": "cp-naomi-run-000123",
  "correlation_id": "corr-000123",
  "causation_id": "dispatch-msg-000123",
  "agent_id": "naomi",
  "work_item_id": "79d85c10-a247-4529-bda5-2faed8eed082",
  "work_item_key": "MC-568",
  "payload": {
    "message": "Execution started",
    "work_dir": "/home/kuba/repos/mission-control"
  }
}
```

## Required event types in v1

### 1. `agent.assignment.accepted`

Meaning:
- Naomi accepted the dispatched story and will proceed.

Required payload fields:
- `message`
- `work_dir`
- `next_phase` = `PLANNING` or `EXECUTING`

Control Plane effect:
- marks assignment acknowledged,
- planning status may move to `IN_PROGRESS`,
- runtime should no longer remain in pure `ACK_PENDING`.

### 2. `agent.planning.started`

Meaning:
- Naomi is creating missing tasks / execution plan.

Required payload fields:
- `message`

Control Plane effect:
- runtime state -> `PLANNING`.

### 3. `agent.planning.completed`

Meaning:
- planning finished successfully.

Required payload fields:
- `message`
- `tasks_created_count`
- `next_phase`

Recommended `next_phase`:
- `EXECUTING`
- `BLOCKED`

Control Plane effect:
- stores planning completion milestone,
- expects either immediate `agent.execution.started` or a blocker event.

### 4. `agent.planning.blocked`

Meaning:
- planning could not complete safely.

Required payload fields:
- `message`
- `blocker_reason`

Control Plane effect:
- runtime state -> `BLOCKED`.

### 5. `agent.execution.started`

Meaning:
- Naomi started actual implementation work on the story.

Required payload fields:
- `message`
- `branch_name`
- `work_dir`

Control Plane effect:
- runtime state -> `EXECUTING`.

### 6. `agent.task.started` *(recommended, optional in first cut)*

Meaning:
- Naomi started a specific implementation task.

Payload fields:
- `task_id`
- `task_key`
- `task_title`

### 7. `agent.task.completed` *(recommended, optional in first cut)*

Meaning:
- Naomi completed a specific implementation task.

Payload fields:
- `task_id`
- `task_key`
- `task_title`

### 8. `agent.task.blocked` *(recommended, optional in first cut)*

Meaning:
- Naomi hit a blocker on a specific task.

Payload fields:
- `task_id`
- `task_key`
- `task_title`
- `blocker_reason`

Control Plane effect:
- runtime may remain `EXECUTING` or move to `BLOCKED` according to v1 policy,
- blocker reason must remain operator-visible.

### 9. `agent.pr.opened`

Meaning:
- Naomi opened a PR for the story.

Required payload fields:
- `pr_url`
- `pr_number`
- `branch_name`

Control Plane effect:
- preserves handoff evidence for review-ready state.

### 10. `agent.review.requested`

Meaning:
- Naomi handed off for review/QA.

Required payload fields:
- `next_agent_id`
- `pr_url`
- `message`

Recommended value:
- `next_agent_id = "amos"`

Control Plane effect:
- runtime may move to `REVIEW_READY`,
- Naomi capacity becomes eligible for release according to story `MC-570`.

### 11. `agent.execution.completed`

Meaning:
- Naomi's execution responsibility for this story is complete.

Required payload fields:
- `message`
- `completion_reason`

Recommended `completion_reason` values:
- `REVIEW_HANDOFF`
- `DONE`

Control Plane effect:
- terminal milestone for Naomi-owned execution.

### 12. `agent.execution.failed`

Meaning:
- execution failed in a terminal way.

Required payload fields:
- `message`
- `failure_reason`

Control Plane effect:
- runtime state -> `FAILED`.

## Minimum v1 required sequence

Happy path with planning:
1. `agent.assignment.accepted`
2. `agent.planning.started`
3. `agent.planning.completed`
4. `agent.execution.started`
5. `agent.pr.opened`
6. `agent.review.requested`
7. `agent.execution.completed`

Happy path without planning:
1. `agent.assignment.accepted`
2. `agent.execution.started`
3. `agent.pr.opened`
4. `agent.review.requested`
5. `agent.execution.completed`

Blocked path during planning:
1. `agent.assignment.accepted`
2. `agent.planning.started`
3. `agent.planning.blocked`

Failure path during execution:
1. `agent.assignment.accepted`
2. `agent.execution.started`
3. `agent.execution.failed`

## State mapping reference

Recommended v1 mapping:
- internal dispatch logic sets `QUEUED -> DISPATCHING -> ACK_PENDING`
- `agent.assignment.accepted` ends pure ack wait
- `agent.planning.started` -> `PLANNING`
- `agent.execution.started` -> `EXECUTING`
- `agent.planning.blocked` or terminal blocker path -> `BLOCKED`
- `agent.review.requested` -> `REVIEW_READY`
- `agent.execution.completed` -> terminal completion for Naomi's execution responsibility
- `agent.execution.failed` -> `FAILED`

## Watchdog relevance

Watchdog should reason from this contract, not from vague transcript guesses.

Minimum watchdog signals:
- no `agent.assignment.accepted` before ack timeout -> timeout path,
- no new runtime event while in `PLANNING` or `EXECUTING` for too long -> stale path,
- bounded retry policy after recoverable dispatch/runtime failure,
- visible terminal failure after retries are exhausted.

## Guardrails

- Do not treat assignment alone as active execution.
- Do not move planning status to `IN_PROGRESS` on assignment alone.
- Do not make James the required relay for hot-path runtime dispatch.
- Do not use raw transcript scraping as the primary state source.
- Do not revive legacy `orchestration` as the main delivery model.

## Related work items

- `MC-566` queue ingress
- `MC-567` dispatch selection
- `MC-568` OpenClaw dispatch adapter
- `MC-569` Naomi runtime callbacks
- `MC-570` planning/runtime state sync
- `MC-571` watchdog behavior
- `MC-572` operator read models

## Navigation

- ↑ [INDEX.md](./INDEX.md)
- ↑ [CONTROL_PLANE_V1.md](./CONTROL_PLANE_V1.md)
