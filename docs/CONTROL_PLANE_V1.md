# Control Plane v1

**Status:** Proposed v1 direction  
**Date:** 2026-03-16  
**Scope:** Control Plane module within Mission Control + OpenClaw integration

---

## 1) Purpose

This document is the **root-level source of truth** for the Control Plane in Mission Control.

The Control Plane is the orchestration module responsible for:
- taking assignment intent from Planning,
- queueing work per specialist,
- dispatching work to execution,
- tracking runtime state,
- handling retries / stale sessions / watchdog flows,
- providing operator-facing monitoring read models.

This document defines:
- the target operating model,
- the primary use cases,
- the module boundaries,
- the runtime states and high-level events,
- the implementation constraints that later API / Web / CLI technical docs must follow.

This document is intentionally **system-level**, not service-level.
Implementation details belong in module docs such as `services/api/docs/*`.

---

## 2) Module positioning

The system is intentionally split into distinct concerns:

| Module / System | Responsibility |
|---|---|
| **Planning** | Work system of record: projects, epics, stories, tasks, bugs, backlog/sprint context, assignees, business-facing status |
| **Control Plane** | Orchestration module inside Mission Control: queueing, dispatch, capacity, runtime state, retries, watchdog, monitoring read models |
| **Control Plane → OpenClaw adapter** | Integration layer that translates Control Plane actions into OpenClaw session operations and maps runtime signals back into Control Plane events |
| **OpenClaw Runtime** | External execution plane: agents, sessions, ACP threads, sub-sessions, tool execution |
| **James** | User-facing orchestrator persona and strategic front door |

### Important design rule

**The Control Plane is a module inside Mission Control.**  
It is **not** a separate product and **not** the execution runtime itself.

**OpenClaw remains the execution runtime.**  
The Control Plane decides and tracks. OpenClaw executes.

---

## 3) Goals

### Primary goals

- Use **one OpenClaw Gateway** with **multiple isolated agents**.
- Keep **James** as the main user-facing agent and strategic orchestrator.
- Use specialist agents for execution:
  - **Naomi** — coding / implementation
  - **Amos** — QA / verification / review execution
  - **Alex** — research / analysis
- Keep **Planning** as the source of truth for work items.
- Use the **Control Plane** as the orchestration module inside Mission Control.
- Use **OpenClaw** as the execution fabric for agent sessions.
- Support **assignment-driven execution** starting from a Planning work item.
- Provide clear monitoring for:
  - what each agent is doing,
  - what is queued,
  - what is blocked,
  - what is ready for review,
  - what failed or needs intervention.

### Operational goals

- One specialist agent handles **one active User Story at a time**.
- Task execution for a story is **sequential**, not parallel.
- Assignment dispatch is **push-driven**, not polling-driven.
- Cron is used only for **reconciliation, recovery, and watchdog duties**.

---

## 4) Non-goals for v1

- Direct day-to-day conversation with specialist agents as the primary user experience.
- Parallel execution of multiple tasks from the same story by the same specialist agent.
- A generic event runtime detached from actual work execution.
- Full multi-agent swarm planning/execution semantics.
- High-throughput queue optimization.
- Multiple execution backends beyond OpenClaw.

v1 is intentionally biased toward **clarity, determinism, and operator visibility**.

---

## 5) Core operating model

### 5.1 Human interaction model

- **Kuba primarily talks to James.**
- James is the strategic front door, status surface, and orchestrator of specialist work.
- Specialist agents are treated as **internal crew**, not primary user-facing personas.
- Specialists should report back into the system and to James; James should remain the normal user-facing voice.

### 5.2 Execution model

The intended path is:

**Planning → Control Plane → OpenClaw → Specialist Agent → Control Plane → James / operator visibility**

More concretely:
1. Planning records assignment intent.
2. The Control Plane converts that intent into runtime work.
3. The Control Plane dispatches work to OpenClaw.
4. OpenClaw runs the specialist session.
5. Runtime signals flow back into the Control Plane.
6. James and the operator see a clean orchestration view.

### 5.3 Capacity model

Each specialist agent has:
- **capacity = 1 active story** in v1
- an ordered queue of assigned-but-not-yet-started stories

This means:
- assigning five stories to Naomi is allowed,
- but Naomi should actively work only on the first available one,
- the rest remain queued until Naomi becomes free.

### 5.4 Ownership model

In v1:
- one specialist owns **one active story** at a time,
- one story uses **one active branch** at a time,
- one specialist executes **one active task sub-session** at a time within that story,
- James remains the orchestration persona, but should **not** be the runtime bottleneck.

---

## 6) Canonical use cases

### UC-1 — Assign a User Story to a specialist agent

#### Trigger
A User Story in `TODO` is assigned to Naomi:
- via Mission Control UI, or
- via CLI / automation (for example by James using `mc`).

#### Expected behavior
- The assignment enters the Control Plane.
- Planning records that the story is intended for Naomi.
- The story is placed into Naomi's queue.
- If Naomi is idle, dispatch can start immediately.
- If Naomi is busy, the story remains queued.

#### Important rule
**Assignee and runtime state are separate concerns.**  
A story may be assigned to Naomi while still waiting in queue.

---

### UC-2 — Naomi accepts the story and checks whether planning exists

#### Trigger
Naomi receives a story dispatch.

#### Expected behavior
- Naomi acknowledges the assignment.
- Naomi inspects the assigned story.
- Naomi checks whether the story already has tasks.

#### Outcomes
- If tasks exist → proceed to execution.
- If tasks do not exist → run planning first.

#### Important rule
The story should move to `IN_PROGRESS` when Naomi **actually accepts and starts working**, not merely when it is assigned.

---

### UC-3 — Naomi plans the story when tasks are missing

#### Trigger
The assigned story has no tasks.

#### Expected behavior
- Naomi starts a planning sub-session.
- The planning sub-session analyzes the story and creates tasks under that story.
- If planning is too large or ambiguous, Naomi raises a blocker instead of fabricating a bad plan.

#### v1 planning rule
- If planning produces **more than 10 tasks**, treat it as a **blocker / escalation case**.

#### Outcomes
- `TASKS_CREATED` → Naomi continues into execution.
- `BLOCKED` → James and the operator can see why execution did not proceed.

---

### UC-4 — Naomi executes tasks sequentially

#### Trigger
The story has tasks and Naomi is in execution mode.

#### Expected behavior
- Naomi creates **one branch per story**.
- Naomi works through tasks **one by one**.
- For each task:
  - mark task `IN_PROGRESS`,
  - spawn a sub-session to execute the work,
  - commit the result,
  - mark task `DONE`, or mark it blocked if needed.

#### Important rules
- v1 execution is **sequential**.
- Only **one active task execution sub-session** exists at a time for a given story.
- Parallel task execution inside the same story is out of scope for v1.

---

### UC-5 — Naomi completes development and hands off to Amos

#### Trigger
All tasks in the story are complete.

#### Expected behavior
- Naomi opens a well-described Pull Request.
- Naomi moves the story to `CODE_REVIEW`.
- Naomi assigns the story to Amos.
- Naomi's active execution flow for that story ends.

#### Result
Naomi becomes available for the next queued story.

---

### UC-6 — James provides operator-facing visibility

#### Trigger
Any important runtime transition occurs.

#### Expected behavior
James should be able to tell Kuba:
- what Naomi is currently working on,
- what is queued for Naomi,
- whether planning was created,
- whether something is blocked,
- whether a PR is ready,
- whether Amos has the next step.

#### Important rule
James is the **main interaction surface**, but should not become a runtime bottleneck for dispatch.

---

## 7) Core architectural decisions

### 7.1 One Gateway, many agents

The target topology is:
- **one OpenClaw instance / Gateway**,
- multiple isolated agents,
- one shared Mission Control system.

This gives:
- per-agent isolation for workspace/session/auth,
- simpler operations,
- lower infrastructure overhead,
- easier orchestration across specialist agents.

### 7.2 The Control Plane lives inside Mission Control

The Control Plane is a Mission Control module.
It should be modeled as first-class Mission Control functionality, not as a sidecar concept or naming wrapper over generic runtime plumbing.

### 7.3 OpenClaw is the execution plane

OpenClaw is the external runtime that actually executes specialist work:
- agent identity,
- sessions,
- ACP threads,
- sub-sessions,
- tool execution.

The Control Plane should integrate with OpenClaw through a dedicated adapter layer, but should not duplicate OpenClaw runtime responsibilities.

### 7.4 Push-driven dispatch

The primary dispatch model is:
- **Planning records an assignment**,
- the **Control Plane** emits the orchestration event,
- a dispatch worker delivers the work to the specialist agent.

This is preferred over polling because it is:
- lower latency,
- cheaper,
- easier to reason about,
- better for retries and idempotency.

### 7.5 Cron is only a safety net

Cron / scheduled sweeps should be used only for:
- reconciliation,
- stale-session detection,
- retry scheduling,
- repairing stuck states,
- capacity correction.

Cron should **not** be the primary work-discovery mechanism for specialist agents.

### 7.6 Planning state and runtime state must be separate

The Control Plane must distinguish:
- planning status (`TODO`, `IN_PROGRESS`, `BLOCKED`, `CODE_REVIEW`, ...)
- runtime execution state (`QUEUED`, `DISPATCHING`, `PLANNING`, `EXECUTING`, ...)

A single planning status field is not enough to express queueing, acceptance, dispatch failure, or stale execution.

### 7.7 Story is the unit of active specialist ownership

In v1:
- a specialist agent owns **one active story** at a time,
- a story owns **one active branch** at a time,
- the story is the main execution container,
- tasks are subordinate execution steps inside that story.

### 7.8 James should not be the hot-path dispatcher

James is the strategic orchestrator and user-facing persona.
The Control Plane should still be able to dispatch work directly based on system state.

James should observe, summarize, escalate, and steer — not be required as a human-style relay hop for every runtime action.

---

## 8) Canonical state model

### 8.1 Planning state (existing / user-facing)

| State | Meaning |
|---|---|
| `TODO` | not yet actively worked |
| `IN_PROGRESS` | specialist accepted and is actively working |
| `BLOCKED` | story cannot currently proceed |
| `CODE_REVIEW` | development complete; ready for review |
| `VERIFY` | verification / QA phase |
| `DONE` | finished |

### Important note

**Assignee is not a state.**  
A story may be assigned to Naomi while still sitting in Control Plane runtime state `QUEUED`.

### 8.2 Runtime state (Control Plane-facing)

| State | Meaning |
|---|---|
| `QUEUED` | assigned to an agent but waiting for capacity |
| `DISPATCHING` | system is attempting to deliver the assignment |
| `ACK_PENDING` | dispatch sent; waiting for specialist acceptance |
| `PLANNING` | specialist is creating tasks / execution plan |
| `EXECUTING` | specialist is actively executing tasks |
| `BLOCKED` | execution cannot continue without intervention |
| `REVIEW_READY` | development complete and review handoff made |
| `DONE` | specialist execution for this story is complete |
| `FAILED` | orchestration/runtime failure needs intervention |

---

## 9) High-level event model

These are **Control Plane domain events**, not transport-specific implementation details.

### Event namespace note

For v1, example event names use the `agent.*` namespace because the orchestration domain is specialist-agent work execution inside the Control Plane.

### Assignment / queue
- `agent.assignment.requested`
- `agent.assignment.queued`
- `agent.assignment.dispatched`
- `agent.assignment.accepted`
- `agent.assignment.rejected`
- `agent.assignment.ack_timed_out`
- `agent.assignment.retry_scheduled`

### Planning
- `agent.planning.started`
- `agent.planning.completed`
- `agent.planning.blocked`

### Execution
- `agent.execution.started`
- `agent.task.started`
- `agent.task.completed`
- `agent.task.blocked`

### Finish / handoff
- `agent.pr.opened`
- `agent.review.requested`
- `agent.execution.completed`

### Recovery / operations
- `agent.dispatch.failed`
- `agent.session.stale`
- `agent.watchdog.intervened`
- `agent.execution.failed`

---

## 10) Recommended system flow

### 10.1 Assignment ingress
1. A story is assigned to Naomi in Planning.
2. Planning records the assignment change.
3. The Control Plane creates a runtime work item in Naomi's queue.
4. Runtime state becomes `QUEUED`.

### 10.2 Dispatch
1. A Control Plane dispatch worker checks Naomi capacity.
2. If Naomi is idle, the queued story is dispatched.
3. Runtime state becomes `DISPATCHING`, then `ACK_PENDING`.

### 10.3 Acceptance
1. Naomi accepts the assignment.
2. The story becomes `IN_PROGRESS`.
3. Naomi checks whether tasks exist.

### 10.4 Planning branch
If tasks do not exist:
1. Runtime state becomes `PLANNING`.
2. A planning sub-session creates tasks or returns a blocker.
3. If blocked, runtime state becomes `BLOCKED`.
4. If tasks are created, runtime state moves to `EXECUTING`.

### 10.5 Execution branch
If tasks exist:
1. Naomi creates one branch for the story.
2. Naomi executes tasks by spawning sub-sessions sequentially.
3. Each task moves through `TODO -> IN_PROGRESS -> DONE` or `BLOCKED`.

### 10.6 Abnormal conditions

#### No acknowledgment
If Naomi does not acknowledge within the defined timeout window:
1. Emit `agent.assignment.ack_timed_out`.
2. Schedule retry according to Control Plane policy.
3. If retries are exhausted, move runtime state to `FAILED` or escalate for operator action.

#### Blocker during planning or execution
If Naomi or a sub-session returns a blocker:
1. Mark the relevant task or story as blocked according to Planning rules.
2. Move runtime state to `BLOCKED`.
3. Preserve blocker reason for monitoring.
4. Surface the blocker to James and the operator.

#### Stale session
If the active specialist session stops updating within the watchdog window:
1. Emit `agent.session.stale`.
2. Let the watchdog decide whether to retry, requeue, fail, or escalate.
3. Record the intervention in Control Plane monitoring state.

### 10.7 Completion and handoff
1. Naomi opens a PR.
2. The story becomes `CODE_REVIEW`.
3. The story is assigned to Amos.
4. Naomi runtime state becomes `REVIEW_READY` / `DONE`.
5. Naomi becomes available for the next queued story.

---

## 11) System boundaries

### Planning owns
- work items,
- assignee fields,
- planning status,
- backlog / sprint / project context.

### Control Plane owns
- assignment intake,
- queue/order per specialist,
- dispatch,
- capacity rules,
- runtime state,
- monitoring read models,
- retry / watchdog / reconciliation behavior,
- operator actions such as retry, requeue, reassign, and escalation.

### OpenClaw owns
- specialist agent identity/runtime,
- session execution,
- ACP thread/session lifecycle,
- sub-sessions used for planning or task execution.

### James owns
- user-facing summaries,
- strategic orchestration context,
- escalation visibility,
- operator-facing interpretation of runtime state.

---

## 12) Monitoring expectations

The system should make the following visible without opening raw execution logs:
- which story each specialist is actively handling,
- what is queued next,
- current runtime state,
- current task,
- branch / PR reference,
- last update time,
- blocker reason,
- whether the next step belongs to Naomi, Amos, or another specialist.

Raw event timelines should remain available for diagnostics, but they are **not** the primary operator UX.

---

## 13) Guardrails

- Assignment does not automatically mean active execution.
- Story acceptance, not assignment alone, should move the story to `IN_PROGRESS`.
- One specialist agent handles one active story at a time in v1.
- One story uses one active branch at a time in v1.
- Task execution is sequential in v1.
- Planning that explodes past a reasonable threshold should escalate rather than silently over-decompose.
- Recovery logic must be explicit and observable.
- The Control Plane should model real work execution, not a generic runtime demo detached from product flow.

---

## 14) Follow-on technical documents

This document should drive follow-on implementation docs, including:

### API / runtime
- assignment event contract
- runtime state machine
- queue and capacity rules
- dispatch worker behavior
- watchdog / reconciler behavior
- runtime read-model schema

### Web
- operator monitoring views
- specialist queue / active work UI
- story runtime detail view
- exceptions / blocked / stale views

### CLI
- operator commands for queue, retry, reassign, and runtime inspection

### OpenClaw integration
- ACP thread/session binding strategy
- session metadata contract stored in Mission Control
- James-facing summary / mirror event integration

---

## 15) Decision summary

If there is one short version of this document, it is this:

- **One Gateway, many agents**
- **James is the front door**
- **Planning is the work source of truth**
- **Control Plane owns orchestration**
- **OpenClaw is the execution plane**
- **Assignments should flow from Planning into the Control Plane**
- **Naomi plans when needed, then executes tasks sequentially**
- **Amos receives review handoff after PR creation**
- **Cron is recovery logic, not the main dispatch mechanism**

## Navigation

- ↑ [Docs Index](./INDEX.md)
- ↑ [README.md](../README.md)
- ↑ [AGENTS.md](../AGENTS.md)
