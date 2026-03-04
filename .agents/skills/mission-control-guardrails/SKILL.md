---
name: mission-control-guardrails
description: Mission Control execution guardrails for coding and planning work in /home/kuba/repos/mission-control. Use when implementing features/bugs or mutating planning data so work stays safe, reproducible, and aligned with repo rules (including mc CLI-first planning operations).
---

# Mission Control Guardrails

Apply this workflow for every Mission Control task.

## 1) Set scope and safety boundaries

- Work only in `/home/kuba/repos/mission-control` unless explicitly told otherwise.
- Do not run deploy/release/infra actions.
- Do not modify production secrets or environment credentials.
- Prefer minimal-diff changes over broad rewrites.

## 2) Preflight before changes

- Read root `AGENTS.md` and relevant docs under `docs/` for touched area.
- Confirm target layer: `apps/web`, `apps/cli`, `services/api`, or mixed.
- For planning data mutations (stories/tasks/boards/labels/backlogs):
  - run `mc --help` first,
  - then run help for concrete command,
  - then execute via `mc` only.

## 3) Implementation discipline

- Keep behavior changes explicit and traceable.
- Preserve API/DTO compatibility unless task explicitly allows breaking change.
- Add or update tests for new behavior/regressions.
- Keep naming and status enums aligned with existing planning model.

## 4) Validation before handoff

- Run quality gates for touched areas (use `mission-control-test-gate` if available).
- Re-check no accidental unrelated file changes.
- Summarize exactly what changed, why, and how verified.

## 5) Output format

Return:
- scope completed,
- files changed,
- commands run,
- validation results,
- blockers (if any).
