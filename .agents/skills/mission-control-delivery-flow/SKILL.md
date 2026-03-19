---
name: mission-control-delivery-flow
description: End-to-end execution flow for Mission Control user stories. Use when asked to plan and implement a US/bug from planning through tasks, coding, PR, review, merge, deploy, and story closure using mc CLI + gh.
---

# Mission Control Delivery Flow

Execute this flow when the user asks to deliver a story/bug end-to-end.

## Preconditions

- Work in the Mission Control repo root unless user explicitly says otherwise.
- Read repo/project AGENTS/docs as required by AGENTS policy.
- For work-items use `mc` CLI only.
- By work-item we are colling UserStory or Task or Bug

## Planning operation preflight (mandatory)

Use `mc` CLI for all planning entities (projects, epics, stories, tasks, backlogs, labels, agents). No direct DB or API mutations.

Full command reference, recipes, and placement rules: `/home/kuba/.openclaw/skills/mc-cli-router/SKILL.md`

1. please read 

## Phase 0 - Preparation

0. Set thinking to High!
1. Read the work-item details using the MC CLI by element code.
2. If the work-item is not attached to the current sprint in the MC project, attach it.
3. If it is not attached to an epic, attach the story to an epic – you can get the list of epics and choose the best one.
4. Add labels to the user story.
5. Assign UserStory to Naomi.
6. Checkout `main`.
7. Pull the latest changes.
8. Create a new implementation branch using the work-item code and a short description.

## Phase 1 — Implementation

### 1.1 — Plan (the plan IS the MC tasks)

1. **Design atomic implementation tasks** for the target work-item.
2. **Record each task in MC** via `mc task create` with `--set parent_id=<WORK_ITEM_ID>`.
   - Every task MUST have `parent_id` set to the target work-item's UUID. This is how MC links children to parents. Do NOT use `story_id`.
3. **Verify linkage:** run `mc task list --parent-key <WORK_ITEM_KEY> --output json` and confirm `total` matches the number of tasks you created. If any task has `parent_id: null`, fix it before proceeding.
4. Set thinking to Medium after planning!

### 1.2 — Execute (task-by-task loop)

5. **Start story**: set story `IN_PROGRESS` via `mc story update`.
6. For **each** task (sequentially, one at a time):
   a. Set task `IN_PROGRESS` via `mc task update`.
   b. Implement code + commit.
   c. Run quality gates (see `mission-control-test-gate`).
   d. Set task `DONE` via `mc task update`.
   e. If blocked: set task `BLOCKED` with `blocked_reason`, report `BLOCKER`, and stop.
   - **Do NOT start the next task until the current one is DONE or BLOCKED.**

## Phase 2 — Pull Request

1. Create PR to `main` using `gh pr create`.
2. Set story status to `CODE_REVIEW` via `mc story update`.

## Phase 3 — Review and fixes

Code review is delegated to a sub-agent. Maximum **3 review loops** before escalation.

### 3.1 — Spawn review sub-agent

Use the `Agent` tool to spawn a sub-agent with the following context in its prompt:

```
You are a senior code reviewer for the Mission Control monorepo.

## Context
- Repo root: /home/kuba/repos/mission-control
- Work item: <WORK_ITEM_KEY> — <WORK_ITEM_TITLE>
- PR number: <PR_NUMBER>
- Base branch: main

## Required reading before review
1. /home/kuba/repos/mission-control/AGENTS.md — repo rules and review guidelines
2. /home/kuba/repos/mission-control/docs/standards/coding-standards.md — quality gate, git, file size, code quality
3. /home/kuba/repos/mission-control/docs/standards/coding-standards-backend.md — if PR touches services/api/
4. /home/kuba/repos/mission-control/docs/standards/coding-standards-frontend.md — if PR touches apps/web/
5. /home/kuba/repos/mission-control/docs/standards/testing-standards-backend.md — if PR touches backend tests
6. /home/kuba/.openclaw/skills/mc-cli-router/SKILL.md — only if PR touches planning CLI operations

Read the standards relevant to the changed files BEFORE reviewing.

## Review scope
1. Run: gh pr diff <PR_NUMBER>
2. Review the ENTIRE diff systematically — do not stop after 1-2 findings.
3. Check: correctness, edge cases, error handling, performance regressions, null handling,
   backward compatibility, API contract changes, race conditions, unused imports/dead code,
   adherence to coding standards read above.
4. Treat correctness and security as P1.

## Output protocol
- If NO findings: return exactly "REVIEW_RESULT: CLEAR"
- If findings exist:
  1. Post EACH finding as a separate PR comment using:
     gh pr comment <PR_NUMBER> --body "**CR finding (<severity>):** <description>"
     where severity is one of: P1-blocker, P2-should-fix, P3-nit
  2. Return exactly "REVIEW_RESULT: DIRTY — <N> findings posted"

Do NOT fix code. Do NOT create commits. Review only.
```

Fill in `<WORK_ITEM_KEY>`, `<WORK_ITEM_TITLE>`, and `<PR_NUMBER>` from the current session context.

### 3.2 — Handle review result

**If CLEAR:** proceed to Phase 4.

**If DIRTY:**
1. Set story status back to `IN_PROGRESS` via `mc story update`.
2. For each finding posted on the PR:
   - Fix the issue in code.
   - Resolve the comment on the PR: `gh pr comment <PR_NUMBER> --body "Fixed in <commit-sha>."`
3. Run quality gates (lint + tests).
4. Commit and push fixes.
5. Set story status to `CODE_REVIEW` via `mc story update`.
6. **Loop back to 3.1** — spawn a fresh review sub-agent.

### 3.3 — Escalation

If the review loop has run **3 times** and the sub-agent still returns DIRTY:
- Stop and report `BLOCKER`.
- Post a summary of unresolved findings to the PR.
- Escalate to the user for manual decision.

## Phase 4 — Verify phase

1. Move the work-item into Verify state via mc cli
2. Assign story to agent: Amos

## Phase 5 — Closure
1. Assume that the verification is complete.
2. Merge the PR using `gh pr merge`, checkout `main`, and pull the latest changes.
3. Set story status to `DONE` via `mc story update`.
4. Unassign story from the agent.
5. Delete both local and origin implementation branches.

## Phase 6 — Deploy (DEV)

Deploy the merged changes to the DEV container runtime.

1. Ensure you are on `main` with latest changes pulled (should be done in Phase 5).
2. Run the deploy script in non-interactive mode:
   ```bash
   ./infra/deploy.sh dev
   ```
   This builds Docker images (api + web), runs migrations, starts/updates the DEV stack,
   and runs smoke checks against `http://127.0.0.1:5000/healthz` and `http://127.0.0.1:3000/dashboard`.
3. **Verify the output:**
   - All build steps complete without error.
   - Smoke checks pass (API healthz + WEB dashboard respond).
   - `[OK] DEV deploy complete` appears at the end.
4. **If deploy fails:** report `BLOCKER` with the error output and escalate to the user.
   Do NOT retry automatically — deploy failures may require infrastructure investigation.

> **Note:** PROD deploy (`./infra/deploy.sh prod`) is never run autonomously.
> Only DEV deploy is in scope for the E2E flow. PROD requires explicit user authorization.

## Quality bar

- Follow zero-warnings policy: fix at source.
- Do not hide issues with `# noqa`, blanket disables, lint-ignore hacks, or weakened configs unless explicitly approved by user.
- Keep fixes senior-level and minimal-risk.

## Blocker protocol

Stop and report `BLOCKER` only when autonomous resolution is not possible (e.g., unresolved deploy failure, merge conflict requiring user decision, unclear failing tests).

Do not stop for routine fixable issues (lint errors, straightforward test failures, review comments).

## Output contract

Return concise status updates:

1) `DONE` or `BLOCKER`
2) changed resources (story/task keys, PR URL, commit refs)
3) follow-up needed (if any)

## Related skills

- `mission-control-guardrails`
- `mission-control-test-gate`
- `mission-control-api-contract-check`
