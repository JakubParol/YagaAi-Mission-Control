---
name: mission-control-delivery-flow
description: End-to-end execution flow for Mission Control user stories. Use when asked to plan and implement a US/bug from planning through tasks, coding, PR, review, merge, deploy, and story closure using mc CLI + gh.
---

# Mission Control Delivery Flow

Execute this flow when the user asks to deliver a story/bug end-to-end.

## Preconditions

- Work in `/home/kuba/repos/mission-control` unless user explicitly says otherwise.
- Read repo/project AGENTS/docs as required by AGENTS policy.
- For planning entities use `mc` CLI only.
- By planning element we are colling UserStory or Task or Bug

## Planning operation preflight (mandatory)

Before any planning command/mutation:

1. `mc --help`
2. `mc <resource> --help`
3. `mc <resource> <action> --help`

Prefer `--output json` for deterministic parsing.

## Phase 0 - Preparation

1. Read the planning element details using the MC CLI by element code.
2. If the planning element is not attached to the current sprint in the MC project, attach it.
3. If it is not attached to an epic, attach the story to an epic – you can get the list of epics and choose the best one.
4. Add labels to the user story.
5. Assign UserStory to Naomi.
6. Checkout `main`.
7. Pull the latest changes.
8. Create a new implementation branch using the planning element code and a short description.

## Phase 1 — Implementation

1. **Plan atomic tasks** for the target planning element
2. **Create tasks** in the story via `mc task create`.
3. **Start story**: set story `IN_PROGRESS` via `mc story update`.
4. For each task:
   - set task `IN_PROGRESS` via `mc task update`,
   - implement code + commit,
   - run quality gates (see `mission-control-test-gate`),
   - set task `DONE` via `mc task update`.
   - Do it for each singke task - Status must be updated before you proceed to another task in the loop.

## Phase 2 — Pull Request

5. Create PR to `main` using `gh pr create`.
6. Set story status to `CODE_REVIEW` via `mc story update`.

## Phase 3 — Review and fixes

7. Run `/review` (self-review) or perform CodeReview by yourself if /review is not avaiable.
8. Each finding must be injected into the PR as a comment with gh cli
9. Fix all findings (including small issues), resolve comments in PR, commit and push.

## Phase 4 — Merge and deploy

10. Merge PR with squash (`gh pr merge --squash --delete-branch`).
11. Update local main (`git checkout main && git pull`).
12. Deploy (`./infra/deploy.sh`) unless user explicitly says to skip deploy.
13. Close story: set `DONE` via `mc story update`.

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
