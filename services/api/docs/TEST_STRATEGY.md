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
- integration between routing, application services, repositories, and DB compatibility layers

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

## 3) Test style

Current default style:
- **integration-first** for route + service + repository flows
- **targeted service tests** for orchestration behavior where route-only coverage is not enough
- **support fixtures** for DB/runtime compatibility setup

Typical assertions validate:
- status code
- response envelope shape
- DB side effects
- business rule enforcement
- deterministic orchestration/read-model outputs

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

## Navigation

- ↑ [Docs Index](./INDEX.md)
- ↑ [README](../README.md)
- ↑ [AGENTS](../AGENTS.md)
