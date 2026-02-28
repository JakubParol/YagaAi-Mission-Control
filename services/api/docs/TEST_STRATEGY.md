# Test Strategy — Services API

**Status:** v1.0
**Date:** 2026-02-28
**Scope:** `services/api/` — FastAPI backend for planning + observability modules

## Overview

This document defines the test strategy for the Services API. The goal is to validate all HTTP endpoints, business rules, and data integrity through integration tests against a real SQLite database (in-memory, per-test), ensuring behavior matches the [Entity Model v1](../../../docs/ENTITY_MODEL_V1.md) and [Workflow Logic v1](../../../docs/WORKFLOW_LOGIC_V1.md).

## Test Pyramid

| Level | Scope | Tools | Status |
|-------|-------|-------|--------|
| **Integration** | API endpoints + DB | FastAPI TestClient, pytest, SQLite (tmp) | Active — 139 tests |
| **Unit** | Domain models, pure services | pytest | Future — as domain layer grows |
| **E2E** | Full flow (API → DB → response) | httpx / pytest | Future — for critical paths |

Current focus is integration tests because the API layer is thin (routes → service → repository → SQLite) and integration tests cover the full stack per request.

## Test Structure

```
services/api/tests/
├── conftest.py                          # (empty / future shared fixtures)
├── test_health.py                       # GET /healthz smoke test
├── planning/
│   ├── conftest.py                      # Schema + seed data + TestClient
│   ├── test_epic_routes.py              # Epics CRUD (24 tests)
│   ├── test_story_routes.py             # Stories CRUD + labels (35 tests)
│   ├── test_task_routes.py              # Tasks CRUD + assignments + labels + derivation (46 tests)
│   └── test_backlog_items_routes.py     # Backlog item management + reorder (28 tests)
└── observability/
    ├── conftest.py                      # Langfuse schema + TestClient
    └── test_observability_routes.py     # Costs, requests, models, imports (5 tests)
```

## Fixtures and Test Data

### Database Setup

Each module has its own `conftest.py` with an **autouse** fixture that:

1. Creates a temporary SQLite database (`tmp_path`)
2. Runs the full schema DDL (mirrors production tables)
3. Inserts seed data for realistic test scenarios
4. Patches `app.config.settings.db_path` via `monkeypatch`

This ensures complete test isolation — every test function gets a fresh database.

### Planning Seed Data

| Entity | IDs | Notes |
|--------|-----|-------|
| Projects | p1, p2 | Both ACTIVE, with counters starting at 1 |
| Backlogs | b1, b2 (p1), bg (global) | BACKLOG + SPRINT kinds |
| Stories | s1, s2 (p1), sp2 (p2), sg (global) | All TODO, MANUAL mode |
| Tasks | t1, t2 (p1), tp2 (p2), tg (global) | All TODO |
| Agents | a1, a2 | developer + reviewer roles |

### Observability Seed Data

Empty tables (imports, langfuse_daily_metrics, langfuse_requests) — tests verify empty-state responses.

## Running Tests

```bash
cd services/api

# All tests
poetry run pytest

# Verbose output
poetry run pytest -v

# Single module
poetry run pytest tests/planning/test_task_routes.py

# Single test
poetry run pytest tests/planning/test_task_routes.py::test_create_task_with_project

# With coverage (requires pytest-cov)
poetry run pytest --cov=app --cov-report=term-missing
```

## Linting

Tests are included in lint checks:

```bash
bash scripts/lint.sh          # full lint (includes test files)
bash scripts/lint.sh --fix    # auto-fix formatting
```

Pyright type-checks both `app/` and `tests/` directories.

## Test Patterns

### Arrange-Act-Assert

All tests follow a consistent pattern:
1. **Arrange** — create entities via API calls (POST), or insert directly via SQLite for cross-cutting data (labels)
2. **Act** — call the endpoint under test
3. **Assert** — verify status code, response body structure, and side effects

### Direct DB Access

When testing side effects that require data not yet exposed via API (e.g., labels before label CRUD exists), tests access SQLite directly via the `_setup_test_db` fixture return value.

### Response Envelope

All assertions follow the standard response envelope:
- Success: `{"data": ..., "meta": ...}`
- Error: `{"error": {"code": "...", "message": "..."}}`

### Key Scenarios Covered

- **Happy path** CRUD for every entity
- **Validation** — empty titles (422), invalid statuses (422)
- **Not found** — 404 on nonexistent IDs
- **Conflict** — 409 on duplicates (labels, backlog membership, same-agent assignment)
- **Business rules** — 400 on scope violations (cross-project backlog, global backlog rules)
- **Side effects** — status derivation, completed_at/started_at lifecycle, assignment auto-close on DONE
- **Cascade behavior** — ON DELETE SET NULL verified for epic→stories, story→tasks

## Coverage Goals

- **Current:** 139 integration tests across 6 test files
- **Target:** Maintain full endpoint coverage; add unit tests as domain logic grows
- **Gaps:** Observability module has minimal tests (empty-DB smoke tests only)

## Future Improvements

1. **pytest-cov integration** — add `pytest-cov` to dev dependencies and enforce minimum coverage
2. **Unit tests for domain logic** — as status derivation and workflow rules move to domain layer
3. **Parametrized tests** — reduce boilerplate for similar CRUD patterns across entities
4. **Factory fixtures** — extract entity creation helpers to reduce test verbosity
5. **Load/performance tests** — for backlog reorder and bulk operations

## Navigation

- ↑ [Documentation Index](./INDEX.md)
- ↑ [README](../README.md)
- ↑ [AGENTS](../AGENTS.md)
