# API Architecture — Mission Control

**Status:** Active
**Applies to:** `services/api`

---

## 1) What this service is

`services/api` is a single FastAPI backend with three domain modules:

| Module | Prefix | Responsibility |
|---|---|---|
| `planning` | `/v1/planning` | projects, epics, stories, tasks, backlogs, labels, agents |
| `observability` | `/v1/observability` | Langfuse-backed costs, requests, imports |
| `control_plane` | `/v1/control-plane` | command intake, run/timeline read models, Dapr bridge, watchdog |

The service is organized **by feature first**, then by layer inside each feature.

---

## 2) Current package layout

```text
services/api/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── shared/
│   │   ├── api/
│   │   ├── db/
│   │   ├── logging.py
│   │   └── utils.py
│   ├── planning/
│   │   ├── api/
│   │   ├── application/
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   └── dependencies.py
│   ├── observability/
│   │   ├── api/
│   │   ├── application/
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   └── dependencies.py
│   └── control_plane/
│       ├── api/
│       ├── application/
│       ├── domain/
│       ├── infrastructure/
│       └── dependencies.py
├── tests/
│   ├── planning/
│   ├── observability/
│   ├── control_plane/
│   └── support/
└── docs/
```

---

## 3) Layering rules

Each module follows the same intent:

| Layer | Responsibility |
|---|---|
| `api/` | HTTP routes, request validation, response shaping |
| `application/` | use cases, orchestration, transaction boundaries, ports |
| `domain/` | models, enums, value objects, pure rules |
| `infrastructure/` | repository implementations, external integrations, storage adapters |
| `dependencies.py` | FastAPI wiring for the module |

Rules that matter:
- routers do **not** import repositories directly
- application layer owns orchestration and transaction boundaries
- domain stays framework-light
- shared cross-module utilities live in `app/shared/*`
- cross-project imports from `apps/web` / `apps/cli` are not allowed inside the API service

---

## 4) Runtime wiring

### App composition

`app/main.py` wires:
- request logging / request-id middleware
- health endpoints
- planning router
- observability router
- control-plane router
- control-plane Dapr bridge router

### Configuration

Runtime config is environment-driven via `app/config.py` with the `MC_API_` prefix.

Important families of settings include:
- database connectivity
- OpenClaw config path for agent sync
- control-plane retry / watchdog thresholds
- control-plane rollout flags
- Langfuse credentials for observability import

### Shared infrastructure

`app/shared/db/*` contains DB metadata, session/adapter utilities, and revision checks used across modules.

---

## 5) Control-plane-specific notes

The control-plane module is split into three concerns:

1. **Command intake**
   - validates and accepts control-plane commands
   - persists transactional outbox state

2. **Runtime services**
   - delivery / retry / dead-letter handling
   - worker state machine
   - watchdog and consumer recovery

3. **Read surfaces**
   - runs
   - timeline events
   - attempts
   - metrics
   - Dapr event ingress / readiness hooks

This means the web timeline and CLI diagnostics are consumers of control-plane read models, not owners of control-plane state.

---

## 6) What this doc is for

This document is intentionally structural.
Use other docs for details:
- endpoint-level behavior → [API Contracts](./API_CONTRACTS.md)
- auth posture and actor headers → [Auth](./AUTH.md)
- planning lifecycle rules → [Status Transitions](./STATUS_TRANSITIONS.md)
- test coverage and execution → [Test Strategy](./TEST_STRATEGY.md)

## Navigation

- ↑ [Docs Index](./INDEX.md)
- → [API Contracts](./API_CONTRACTS.md)
- → [Auth](./AUTH.md)
- → [Status Transitions](./STATUS_TRANSITIONS.md)
- → [Test Strategy](./TEST_STRATEGY.md)
