---
name: mission-control-api-contract-check
description: API contract consistency workflow for Mission Control. Use when changing services/api endpoints, schemas, DTO fields, enums, or status logic to keep docs, CLI, and web clients aligned.
---

# Mission Control API Contract Check

Use this when API shape or behavior changes.

## 1) Identify contract impact

Check if change affects:
- endpoint paths/methods,
- request/response fields,
- enum/status values,
- filtering/query parameters,
- error payload semantics.

## 2) Update API docs and model docs

Update relevant docs when needed:
- `services/api/docs/API_CONTRACTS.md`
- `docs/ENTITY_MODEL_V1.md`
- `docs/WORKFLOW_LOGIC_V1.md`

Keep wording concrete: old behavior vs new behavior.

## 3) Verify CLI compatibility

Inspect `apps/cli` commands/options touching changed endpoints.
- Ensure option names and payload fields still match API.
- Ensure list/get/create/update flows remain valid.
- Update command help examples when behavior changed.

## 4) Verify web compatibility

Inspect `apps/web` callers/types for affected routes and fields.
- Update typed models and mapping logic.
- Confirm no stale assumptions about statuses/enums.

## 5) Regression checks

Run:
- API quality gates/tests,
- relevant CLI and web lint/type checks (when touched).

## 6) Contract report

Return a short compatibility report:
- API changes,
- docs updated,
- CLI impact,
- web impact,
- migration notes/backward compatibility.
