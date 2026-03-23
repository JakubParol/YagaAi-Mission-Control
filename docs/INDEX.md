# Documentation Index — Mission Control

## Mandatory

These must be read on every session (referenced from [AGENTS.md](../AGENTS.md)):

| Document | Description |
|---|---|
| [REPO_MAP.md](./REPO_MAP.md) | All projects in this monorepo — what, where, how to navigate |

## Domain Design

| Document | Description |
|---|---|
| [ENTITY_MODEL_V1.md](./ENTITY_MODEL_V1.md) | V2 entity model — projects, work items (epic/story/task/bug), backlogs, agents |
| [WORKFLOW_LOGIC_V1.md](./WORKFLOW_LOGIC_V1.md) | V1 workflow logic — status derivation, blocking, assignments, backlogs |

## System Design

| Document | Description |
|---|---|
| [CONTROL_PLANE_V1.md](./CONTROL_PLANE_V1.md) | Root-level source of truth for the Control Plane: assignment-driven specialist orchestration through Mission Control + OpenClaw |
| [CONTROL_PLANE_NAOMI_DELIVERY_V1.md](./CONTROL_PLANE_NAOMI_DELIVERY_V1.md) | Naomi-first delivery contract for the first real specialist-execution vertical slice: dispatch envelope, runtime callback events, watchdog expectations, and short Claude CLI launch prompts |

## Project Docs

| Project | Docs |
|---|---|
| Web | [`apps/web/AGENTS.md`](../apps/web/AGENTS.md), [`apps/web/docs/INDEX.md`](../apps/web/docs/INDEX.md) |
| CLI | [`apps/cli/AGENTS.md`](../apps/cli/AGENTS.md) (placeholder) |
| API | [`services/api/AGENTS.md`](../services/api/AGENTS.md), [`services/api/docs/INDEX.md`](../services/api/docs/INDEX.md) |

## Other

| Document | Description |
|---|---|
| [MC-386_USABILITY_TEST.md](./MC-386_USABILITY_TEST.md) | Internal usability scenarios and click-reduction evidence for epic overview UX |
| [README.md](../README.md) | Project overview, setup, deployment |
| [AGENTS.md](../AGENTS.md) | AI agent context, rules, required reading |

## Navigation

- ↑ [README.md](../README.md)
- ↑ [AGENTS.md](../AGENTS.md)

## MC-98 — Backlog rows contract

- See [MC-98 — Backlog Jira-like list rows (minimal)](./REPO_MAP.md#mc-98--backlog-jira-like-list-rows-minimal) in the repository map for route scope and file ownership.
