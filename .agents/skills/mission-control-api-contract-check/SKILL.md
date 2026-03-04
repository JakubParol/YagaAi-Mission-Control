---
name: mission-control-api-contract-check
description: API contract consistency workflow for Mission Control. Use when changing services/api endpoints, schemas, DTO fields, enums, filters, or status logic to keep docs, CLI, and web clients aligned and classify breaking vs non-breaking impact.
---

# Mission Control API Contract Check (v2)

Use this whenever API shape or behavior may change.

## 1) Identify contract impact

Check for impact on:
- endpoint paths/methods,
- request/response fields,
- enums/status values,
- filtering/query parameters,
- error payload semantics.

Classify change as:
- **non-breaking**, or
- **breaking** (requires migration/update in callers).

## 2) Update docs when needed

Update relevant docs:
- `services/api/docs/API_CONTRACTS.md`
- `docs/ENTITY_MODEL_V1.md`
- `docs/WORKFLOW_LOGIC_V1.md`

Describe old vs new behavior concretely.

## 3) Verify CLI compatibility

Inspect `apps/cli` commands/options for affected endpoints:
- payload fields and flags still match API,
- list/get/create/update flows remain valid,
- help/examples updated when command behavior changes.

## 4) Verify web compatibility

Inspect `apps/web` API callers/types/mappers:
- update typed models and mapping logic,
- remove stale enum/status assumptions,
- verify affected screens still render expected states.

## 5) Regression checks

Run API gates and any touched client gates.

## 6) Contract report format

Return:
1) change class: `non-breaking` or `breaking`,
2) API/doc/CLI/web deltas,
3) migration/follow-up actions (if breaking).
