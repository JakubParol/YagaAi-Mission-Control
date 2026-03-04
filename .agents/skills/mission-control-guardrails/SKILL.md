---
name: mission-control-guardrails
description: Mission Control execution guardrails for coding and planning work in /home/kuba/repos/mission-control. Use when implementing features/bugs or mutating planning data so work stays safe, reproducible, and aligned with mc CLI-first rules.
---

# Mission Control Guardrails (v2)

Apply this workflow for every Mission Control task.

## 1) Scope and safety boundaries

- Work only in `/home/kuba/repos/mission-control` unless user explicitly states another path.
- Do not run deploy/release/infra actions.
- Do not modify production secrets or credentials.
- Prefer minimal-diff changes over broad rewrites.

## 2) Mandatory preflight

- Read root `AGENTS.md` and relevant docs under `docs/` for touched area.
- Confirm target layer: `apps/web`, `apps/cli`, `services/api`, or mixed.
- For any planning operation via CLI (stories/tasks/boards/backlogs/labels/projects/epics):
  1. `mc --help`
  2. `mc <resource> --help`
  3. `mc <resource> <action> --help`
- Use `--output json` when parsing command results.

## 3) Planning data rules

- Use `mc` only for planning entities (no direct DB edits / direct API curl mutations).
- Use explicit scope selectors (`--project-key` / `--project-id`) whenever possible.
- If repository source/root is needed, resolve from `mc project list/get` (e.g. `repo_root`) and never guess.

## 4) Implementation discipline

- Keep behavior changes explicit and traceable.
- Preserve API/DTO compatibility unless task explicitly allows breaking change.
- Add/update tests for behavior and regressions.
- Keep naming and status enums aligned with current planning model.

## 5) Validation before handoff

- Run quality gates for touched areas (use `mission-control-test-gate`).
- Verify no accidental unrelated file changes.

## 6) Report format

Return exactly:
1) `DONE` or `BLOCKER`
2) changed scope/resources/files (keys/ids when relevant)
3) validation evidence and required follow-up (if any)
