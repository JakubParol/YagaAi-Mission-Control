# Test Strategy — Services API

**Status:** Active
**Scope:** `services/api`

---

## 1) Purpose

The API test suite is intended to protect:
- HTTP contracts
- planning business rules
- orchestration runtime behavior at service/API level
- observability import/read flows
- integration between routing, application services, repositories, and PostgreSQL

The suite is intentionally integration-heavy because the application is thin at the edge and most bugs show up at route/service/repository boundaries.

---

## 2) Current test layout

```text
services/api/tests/
├── conftest.py
├── test_health.py
├── planning/
├── observability/
├── orchestration/
└── support/
```

### Planning coverage

Planning tests cover CRUD and lifecycle behavior for:
- projects
- agents
- labels
- epics
- stories
- tasks
- backlogs
- backlog items
- active sprint and sprint lifecycle flows
- key resolution and epic overview actions

### Observability coverage

Observability tests cover:
- cost summary endpoints
- request listing/model listing
- import status and import-trigger flows

### Orchestration coverage

Orchestration tests cover:
- command acceptance routes
- Dapr bridge routes
- run/timeline read model routes
- delivery service behavior
- worker state machine behavior
- watchdog routes and service logic
- consumer recovery and stream-contract helpers

---

## 3) Test types

### Integration tests (default — bulk of the suite)

Route → service → repo → real PostgreSQL. Full vertical slice. Use when testing CRUD, business rules, status lifecycle, side effects, response shape.

```python
def test_create_task_with_story(client) -> None:
    resp = client.post("/v1/planning/tasks", json={
        "title": "Child Task", "task_type": "TASK",
        "project_id": "p1", "story_id": "s1",
    })
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["story_id"] == "s1"
    assert data["key"] == "P1-1"
```

**When to use:** Default choice. Covers routing, validation, DI wiring, SQL, and response shape in one test.

### Service tests (application layer, mocked ports)

Service instantiated with fake/stub repositories. No DB, no HTTP. Use for complex orchestration logic, state machines, multi-step workflows where integration test would be slow or hard to set up.

```python
async def test_watchdog_retries_before_failing():
    fake_repo = FakeRunRepository(runs=[
        Run(id="r1", status="RUNNING", watchdog_attempt=2, max_attempts=3),
    ])
    service = WatchdogService(run_repo=fake_repo)
    decisions = await service.sweep(evaluated_at=now)
    assert decisions[0].action == "RETRY"  # not FAIL — still under max
```

**When to use:** Logic has branching/state that's tedious to reach via HTTP. Orchestration services are the prime candidate.

### Unit tests (domain layer, pure functions)

No dependencies. Test domain models, enums, value objects, validators, calculations.

```python
def test_status_transition_blocked_to_done_rejected():
    assert not is_valid_transition(current="IN_PROGRESS", target="DONE", is_blocked=True)
```

**When to use:** Domain grows non-trivial invariants, calculations, or state rules that deserve isolated coverage.

---

## 4) Running tests

```bash
cd services/api
poetry run pytest
```

Useful variants:

```bash
poetry run pytest -v
poetry run pytest tests/planning/test_task_routes.py
poetry run pytest tests/orchestration/test_command_routes.py
poetry run pytest --cov=app --cov-report=term-missing
```

---

## 5) Quality expectations

When changing API behavior, the default expectation is:
- update or add tests in the relevant module
- keep route contracts stable unless intentionally changed
- cover regression cases for bug fixes, especially in orchestration and planning lifecycle behavior

Areas that deserve extra care:
- sprint lifecycle and backlog movement semantics
- assignee change / event emission behavior
- orchestration retry / watchdog / read-model correctness
- Dapr bridge behavior and failure handling

## Related

- [Testing Standards — Backend](../../../docs/standards/testing-standards-backend.md) — workspace-level test infrastructure rules, fixtures, and patterns

## Navigation

- ↑ [Docs Index](./INDEX.md)
- ↑ [README](../README.md)
- ↑ [AGENTS](../AGENTS.md)
