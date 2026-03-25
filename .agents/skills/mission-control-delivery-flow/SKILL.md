---
name: mission-control-delivery-flow
description: Delivery flow for Mission Control user stories/bugs. Default autonomous goal is implementation through PR, DEV deploy, and VERIFY handoff. Merge to main, PROD deploy, and full closure require explicit human release instruction after verification.
---

# Mission Control Delivery Flow

Execute this flow when the user asks to deliver a story/bug through the Mission Control workflow.

## Preconditions

- Work in the Mission Control repo root unless the user explicitly says otherwise.
- Read repo/project AGENTS/docs as required by AGENTS policy.
- For planning work-items, use `mc` CLI only.
- A work-item here means a User Story, Task, or Bug.

## MC CLI execution context (mandatory)

The dispatch/delivery contract for a work item provides an explicit API target URL (e.g. `http://127.0.0.1:5000` for DEV, `http://127.0.0.1:5100` for PROD). The assigned agent must use this target for all MC CLI operations via `--api-base`.

Rules:
1. When dispatch provides an API target, use `mc --api-base <target-url>` for **all** operations (reads and writes).
2. Bare `mc` (no `--api-base`) defaults to PROD — safe for direct operator usage but agents must always use the explicit target from their dispatch context.
3. Execution target is a property of the dispatched run, not of the agent identity. Any agent can execute DEV or PROD work depending on what it is dispatched to do.
4. `mc-dev` and `mc-prod` are convenience wrappers available on the host — agents may use them, but `--api-base` from dispatch context is the authoritative mechanism.

## Core delivery rule (mandatory)

- The default autonomous objective is to reach **VERIFY** safely, not to merge to `main`.
- A work-item may enter **VERIFY only after a successful DEV deploy** of the implementation branch.
- **Merge to `main`, PROD deploy, status `DONE`, and branch cleanup are human-gated release actions.**
- Never assume verification is complete.
- Never infer release approval from silence, green checks, or the mere fact that a PR exists.

## Planning operation preflight (mandatory)

Use `mc` CLI for all planning entities (projects, epics, stories, tasks, backlogs, labels, agents). No direct DB or API mutations.

Full command reference, recipes, and placement rules: `/home/kuba/.openclaw/skills/mc-cli-router/SKILL.md`

1. Read `/home/kuba/.openclaw/skills/mc-cli-router/SKILL.md` before making planning mutations.

## Phase 0 - Preparation

0. Set thinking to High.
1. Read the work-item details using the MC CLI by element code.
2. If the work-item is not attached to the current sprint in the MC project, attach it.
3. If it is not attached to an epic, attach it to the best matching epic.
4. Add labels to the user story/bug.
5. Assign the user story to Naomi unless the user explicitly directs otherwise.
6. Checkout `main`.
7. Pull the latest changes.
8. Create a new implementation branch using the work-item code and a short description.
9. Confirm implementation continues on the new branch, not on `main`.

## Phase 1 — Implementation

### 1.1 — Plan (the plan IS the MC tasks)

1. **Design atomic implementation tasks** for the target work-item.
2. **Record each task in MC** via `mc task create` with `--set parent_id=<WORK_ITEM_ID>`.
   - Every task MUST have `parent_id` set to the target work-item UUID. This is how MC links children to parents. Do NOT use `story_id`.
3. **Verify linkage:** run `mc task list --parent-key <WORK_ITEM_KEY> --output json` and confirm `total` matches the number of tasks you created. If any task has `parent_id: null`, fix it before proceeding.
4. Set thinking to Medium after planning.

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

1. Create a PR to `main` using `gh pr create`.
2. Set story status to `CODE_REVIEW` via `mc story update`.

## Phase 3 — Review and fixes

Code review is delegated to a sub-agent. Maximum **3 review loops** before escalation.

### 3.1 — Spawn review sub-agent

Use the `Agent` tool to spawn a sub-agent with the following context in its prompt:

```text
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
  1. Post EACH finding as a **line-level PR review comment** (resolvable) using the GitHub CLI:
     ```
     gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments \
       --method POST \
       -f body="**CR finding (<severity>):** <description>" \
       -f commit_id="$(gh pr view <PR_NUMBER> --json headRefOid -q .headRefOid)" \
       -f path="<relative-file-path>" \
       -f line=<line-number> \
       -f side="RIGHT"
     ```
     where severity is one of: P1-blocker, P2-should-fix, P3-nit.
     If a finding spans a range, use `start_line` + `line` for multi-line comments.
     Use `gh pr diff <PR_NUMBER>` to determine the correct path and line numbers.
  2. Return exactly "REVIEW_RESULT: DIRTY — <N> findings posted"

Do NOT fix code. Do NOT create commits. Do NOT use `gh pr comment` (issue-level). Review only.
```

Fill in `<WORK_ITEM_KEY>`, `<WORK_ITEM_TITLE>`, and `<PR_NUMBER>` from the current session context.

**IMPORTANT:** Do NOT spawn the review agent with `isolation: "worktree"`. Review agents must work on the main repo checkout.

### 3.2 — Handle review result

**If CLEAR:** proceed to Phase 4.

**If DIRTY:**
1. Set story status back to `IN_PROGRESS` via `mc story update`.
2. For each finding posted on the PR:
   - Fix the issue in code.
3. Run quality gates (lint + tests).
4. Commit and push fixes.
5. After push, resolve ALL review comments from the round:
   - List comments: `gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments --jq '.[] | {id, body: .body[:80]}'`
   - Delete each resolved finding: `gh api -X DELETE repos/{owner}/{repo}/pulls/comments/<COMMENT_ID>`
   - Also delete any stale issue-level comments: `gh api repos/{owner}/{repo}/issues/<PR_NUMBER>/comments --jq '.[] | {id, body: .body[:80]}'` → delete each with `gh api -X DELETE repos/{owner}/{repo}/issues/comments/<COMMENT_ID>`
6. Set story status to `CODE_REVIEW` via `mc story update`.
7. **Loop back to 3.1** — spawn a fresh review sub-agent.

### 3.3 — Escalation

If the review loop has run **3 times** and the sub-agent still returns DIRTY:
- Stop and report `BLOCKER`.
- Post a summary of unresolved findings to the PR.
- Escalate to the user for manual decision.

## Phase 4 — Deploy candidate to DEV

Deploy the reviewed implementation branch to the DEV container runtime.

1. Confirm you are still on the implementation branch, not on `main`.
2. Run the deploy script in non-interactive mode:
   ```bash
   ./infra/deploy.sh dev
   ```
3. **Verify the output:**
   - the script reports the implementation branch name
   - all build steps complete without error
   - smoke checks pass (`http://127.0.0.1:5000/healthz` and `http://127.0.0.1:3000/dashboard`)
   - `[OK] DEV deploy complete` appears at the end
4. **If deploy fails:** report `BLOCKER` with the error output and escalate to the user.
   - Do NOT retry automatically.
   - Do NOT move the story to `VERIFY`.
   - Do NOT merge the PR.

## Phase 5 — VERIFY handoff (default stop point)

1. Move the work-item into `VERIFY` via MC CLI.
2. Assign the story to agent: Amos.
3. Return `VERIFY_READY` with:
   - story/task keys
   - PR URL
   - implementation branch name
   - deployed commit SHA
   - DEV URLs checked
4. Stop.

### VERIFY gate (mandatory)

At this point the autonomous flow is complete.

Do **not** do any of the following unless the human explicitly instructs you to continue after verification:
- merge the PR
- checkout/pull `main` for release
- deploy PROD
- set the story to `DONE`
- delete local/origin implementation branches
- perform full closure

## Phase 6 — Post-VERIFY release and closure (human-gated)

Proceed only after the human explicitly confirms verification is complete and authorizes release/merge.

Examples of explicit authorization:
- `verified`
- `verification complete`
- `merge it`
- `deploy prod`
- `close it`

When that explicit instruction is present:

1. Merge the PR using `gh pr merge`.
2. Checkout `main` and pull the latest changes.
3. Run the PROD deploy:
   ```bash
   ./infra/deploy.sh prod
   ```
4. **Verify the output:**
   - all build/migration steps complete without error
   - smoke checks pass (`http://127.0.0.1:5100/healthz` and `http://127.0.0.1:3100/dashboard`)
   - `[OK] PROD deploy complete` appears at the end
5. Set story status to `DONE` via `mc story update`.
6. Unassign the story from the agent.
7. Delete both local and origin implementation branches.

If merge or PROD deploy fails:
- report `BLOCKER`
- do not set story `DONE`
- do not delete branches

## Quality bar

- Follow zero-warnings policy: fix at source.
- Do not hide issues with `# noqa`, blanket disables, lint-ignore hacks, or weakened configs unless explicitly approved by the user.
- Keep fixes senior-level and minimal-risk.

## Blocker protocol

Stop and report `BLOCKER` only when autonomous resolution is not possible (e.g. unresolved deploy failure, merge conflict requiring user decision, unclear failing tests).

Do not stop for routine fixable issues (lint errors, straightforward test failures, review comments).

## Output contract

Return concise status updates:

1. `VERIFY_READY`, `DONE`, or `BLOCKER`
2. changed resources (story/task keys, PR URL, commit refs, deploy target)
3. follow-up needed (if any)

## Related skills

- `mission-control-guardrails`
- `mission-control-test-gate`
- `mission-control-api-contract-check`
