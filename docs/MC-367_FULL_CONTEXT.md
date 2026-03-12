# MC-367 — Full Project Context (PostgreSQL era)

> Generated: 2026-03-11 08:55:57Z (UTC)
>
> Source of truth: Mission Control planning data via `mc` CLI + repository state (`infra/`, `docs/`, `services/api/`).

## 1) Epic record

- **Epic key:** MC-367
- **Title:** Mission Control on OpenClaw: Local Runtime on Docker + Event-Driven Orchestration (Redis/Dapr)
- **Status (DB):** TODO
- **Priority:** 1
- **Stories linked:** 14
- **Created at:** 2026-03-07T13:51:07.348002+00:00
- **Updated at:** 2026-03-07T17:49:38.612822+00:00

### Epic description (DB)

## Summary
Deliver a deterministic local-first orchestration runtime for Mission Control using Docker + Redis + Dapr, with durable event processing, watchdog-based recovery, and operator-grade visibility.

## Scope
1. Local runtime bootstrap for `api`, `web`, `worker`, `redis`, `sqlite`, and Dapr sidecars.
2. Durable eventing model (versioned contracts + transactional outbox).
3. Orchestration runtime (state machine, retries, timeouts, dead-letter, reconciliation).
4. Read/observe surfaces across API/Web/CLI with shared correlation semantics.
5. Hardening via smoke/failure tests and rollout runbook.

## Explicit Exclusions
1. No production HA/multi-region architecture in this epic.
2. No full replacement of synchronous paths in one release; coexistence is expected.
3. No new broker beyond Redis for local mode.
4. No dedicated Docker image pipeline for CLI in this epic (CLI runs as host tool against API contracts).

## Definition of Done
1. Local stack boots deterministically and passes smoke checks.
2. End-to-end workflow lifecycle is driven by durable events with idempotent handlers.
3. Retry/timeout/dead-letter/watchdog paths are validated under failure scenarios.
4. API/Web/CLI expose consistent run timeline diagnostics with correlation IDs.
5. Rollout/rollback/runbook artifacts are complete and actionable for the team.

## 2) Delivery status snapshot

- **Stories:** 14 total · 14 DONE
- **Tasks:** 42 total · 42 DONE
- **Runtime posture:** PostgreSQL-first on local/dev/prod (Docker-based).

## 3) User stories under MC-367

| Story | Type | Status | Title |
|---|---|---|---|
| MC-369 | USER_STORY | DONE | Harden SQLite local durability: migrations, persistence, and recovery |
| MC-370 | USER_STORY | DONE | Define versioned orchestration event contract + transactional outbox |
| MC-371 | USER_STORY | DONE | Implement Redis stream topology with retries and dead-letter semantics |
| MC-372 | USER_STORY | DONE | Wire Dapr components for pub/sub, state, and service invocation |
| MC-373 | USER_STORY | DONE | Build orchestration worker state machine with guarded transitions |
| MC-374 | USER_STORY | DONE | Implement watchdog for stale leases, heartbeat loss, and run timeouts |
| MC-375 | USER_STORY | DONE | Expose run timeline read model API for status and event history |
| MC-376 | USER_STORY | DONE | Extend CLI with run submit/status/tail commands over orchestration APIs |
| MC-377 | USER_STORY | DONE | Ship observability baseline: structured logs, core metrics, and trace correlation |
| MC-378 | USER_STORY | DONE | Build end-to-end orchestration smoke suite with failure-path coverage |
| MC-379 | USER_STORY | DONE | Document rollout controls, rollback playbook, and operations runbook |
| MC-415 | USER_STORY | DONE | Bootstrap deterministic local Docker runtime (api/web/worker/redis/sqlite + Dapr) |
| MC-416 | USER_STORY | DONE | Web timeline UX for orchestration runs (filters, drill-down, failure context) |
| MC-461 | BUG | DONE | WEB: Timeline uses limit=200 and gets 422 from API |

## 4) Tasks by user story

### MC-369 — Harden SQLite local durability: migrations, persistence, and recovery

| Task | Status | Priority | Title | Objective |
|---|---|---:|---|---|
| MC-422 | DONE | 1 | Build SQLite migration + integrity guardrails in API startup | Introduce ordered migration runner with migration ledger, strict startup failure, and corruption diagnostics. |
| MC-423 | DONE | 2 | Add backup/restore tooling and durability docs for local runtime | Provide reproducible backup and recovery scripts plus operator docs for missing/corrupt DB scenarios. |
| MC-424 | DONE | 3 | Add integration tests covering migration idempotency and corruption handling | Validate startup migration application, persisted schema evolution, and deterministic failure on corrupt database files. |

### MC-370 — Define versioned orchestration event contract + transactional outbox

| Task | Status | Priority | Title | Objective |
|---|---|---:|---|---|
| MC-425 | DONE | 1 | Define orchestration envelope and command/event schema contract | Add domain/API contract for versioned orchestration envelopes with required metadata and taxonomy constraints. |
| MC-426 | DONE | 3 | Add compatibility and validation tests for version drift and failure paths | Cover schema-version compatibility, validation details, and no-partial-write behavior on rejected payloads. |
| MC-427 | DONE | 2 | Implement transactional outbox persistence for accepted orchestration commands | Persist command and outbox event atomically via repository transaction and add migration/indexes for outbox table. |

### MC-371 — Implement Redis stream topology with retries and dead-letter semantics

| Task | Status | Priority | Title | Objective |
|---|---|---:|---|---|
| MC-428 | DONE | 1 | Design and codify Redis stream topology + consumer-group contracts | Define stream keys, consumer groups, partitioning strategy, and contract docs/config so producers and consumers use a consistent topology. |
| MC-429 | DONE | 4 | Harden restart/rebalance offset recovery and idempotent delivery handling | Ensure consumer restart and rebalance resume from correct offsets and duplicate deliveries are idempotently ignored; cover with integration tests. |
| MC-430 | DONE | 3 | Route exhausted events to dead-letter stream with replay context | Publish failed-after-max-attempt events to dead-letter stream preserving error details, causation/correlation IDs, and replay metadata for operators. |
| MC-432 | DONE | 2 | Implement ack/retry policy with bounded attempts and backoff metadata | Add consumer processing flow that tracks attempt count, applies deterministic retry/backoff metadata, and acknowledges only on successful state transitions. |

### MC-372 — Wire Dapr components for pub/sub, state, and service invocation

| Task | Status | Priority | Title | Objective |
|---|---|---:|---|---|
| MC-433 | DONE | 2 | Implement API-worker Dapr pub/sub + invocation + state exchange path | Add Dapr subscription/invocation endpoints and worker runtime logic so orchestration events flow worker->pubsub->api and acknowledgements flow api->invocation->worker with state-store persistence. |
| MC-434 | DONE | 3 | Cover Dapr bridge with tests and update runtime docs/contracts | Add API tests for Dapr endpoints and document component version/override strategy plus operator troubleshooting for reproducible local runtime behavior. |
| MC-435 | DONE | 1 | Harden local Dapr component/runtime bootstrap and readiness diagnostics | Parameterize Dapr component/runtime versions in local compose, ensure manifests mount cleanly, and fail fast with root-cause diagnostics when sidecars/components are unhealthy. |

### MC-373 — Build orchestration worker state machine with guarded transitions

| Task | Status | Priority | Title | Objective |
|---|---|---:|---|---|
| MC-436 | DONE | 1 | Implement orchestration run/step state machine with guarded transition validator | Add deterministic transition engine that applies legal run and step lifecycle transitions and rejects illegal mutations without persisting invalid state. |
| MC-437 | DONE | 2 | Persist timeline ledger entries for accepted/rejected lifecycle decisions | Record transition outcomes with correlation-rich diagnostics for both successful transitions and rejected lifecycle events. |
| MC-438 | DONE | 3 | Add crash-safe worker startup reconciliation and duplicate-outcome protection tests | Reconcile in-flight runs on worker startup and ensure terminal completion/failure outcomes are not duplicated across retries/restarts. |

### MC-374 — Implement watchdog for stale leases, heartbeat loss, and run timeouts

| Task | Status | Priority | Title | Objective |
|---|---|---:|---|---|
| MC-439 | DONE | 1 | Add watchdog lease and heartbeat tracking with stale detection thresholds | Persist watchdog lease owner/token/heartbeat timestamps and detect stale/orphaned runs within configured thresholds. |
| MC-440 | DONE | 2 | Implement deterministic watchdog timeout policy actions with timeline events | Apply deterministic retry/fail/quarantine policy for timeout violations and emit first-class timeline watchdog events. |
| MC-441 | DONE | 3 | Protect watchdog mutations with lease-token compare-and-set concurrency guards | Ensure conflicting watchdog actions on the same run are prevented using lease-token CAS semantics and tested for races. |

### MC-375 — Expose run timeline read model API for status and event history

| Task | Status | Priority | Title | Objective |
|---|---|---:|---|---|
| MC-442 | DONE | 1 | Design and implement run timeline read-model endpoints for run state/attempts/events/watchdog actions | Add API/application/infrastructure read path for timeline entities with stable response envelope. |
| MC-443 | DONE | 3 | Add contract/integration tests for timeline response shape and correlation-causation identifiers | Verify backward-compatible response schema and identifier consistency across timeline read APIs. |
| MC-445 | DONE | 2 | Implement filter and deterministic pagination semantics for timeline queries | Support run_id/status/time-range/event-type filters and deterministic ordering with limit/offset pagination. |

### MC-376 — Extend CLI with run submit/status/tail commands over orchestration APIs

| Task | Status | Priority | Title | Objective |
|---|---|---:|---|---|
| MC-449 | DONE | 3 | Document run command usage and failure triage workflow | Update CLI docs with orchestration command examples including one failure-debug flow for operators. |
| MC-450 | DONE | 2 | Add CLI tests for orchestration commands and API error mapping | Cover happy path and failure cases for run submit/status/tail and validate JSON output compatibility for automation. |
| MC-451 | DONE | 1 | Implement CLI orchestration command group for run submit/status/tail | Add mc run submit/status/tail commands mapped to orchestration command and read-model APIs with stable output handling. |

### MC-377 — Ship observability baseline: structured logs, core metrics, and trace correlation

| Task | Status | Priority | Title | Objective |
|---|---|---:|---|---|
| MC-452 | DONE | 3 | Update observability docs and troubleshooting workflow for failed run triage | Document metric/log usage and local runtime triage path with concrete failure-debug steps. |
| MC-453 | DONE | 2 | Expose orchestration health metrics endpoint and CLI access | Publish queue lag, retries, dead-letter count, watchdog interventions, and run latency metrics via API and CLI. |
| MC-454 | DONE | 1 | Implement structured correlation logging across API, worker, and CLI run flows | Emit structured logs with request/run/event correlation fields and preserve causation context through orchestration processing. |

### MC-378 — Build end-to-end orchestration smoke suite with failure-path coverage

| Task | Status | Priority | Title | Objective |
|---|---|---:|---|---|
| MC-455 | DONE | 1 | Implement deterministic orchestration smoke harness for dev runtime and CI | Add executable smoke entrypoint that runs end-to-end orchestration scenarios with stable setup and teardown semantics. |
| MC-456 | DONE | 2 | Add failure-path scenarios covering retry, dead-letter, and watchdog timeout recovery | Extend smoke suite with at least three deterministic fault scenarios validating critical orchestration resilience paths. |
| MC-457 | DONE | 3 | Standardize smoke diagnostics and usage docs for daily operator workflows | Emit actionable failure diagnostics (scenario, service, correlation IDs) and document local/CI execution with expected runtime. |

### MC-379 — Document rollout controls, rollback playbook, and operations runbook

| Task | Status | Priority | Title | Objective |
|---|---|---:|---|---|
| MC-458 | DONE | 1 | Define rollout controls and staged enablement matrix for orchestration runtime | Document capability-level feature gates, default states, and per-environment rollout plan with explicit owner checkpoints. |
| MC-459 | DONE | 2 | Author rollback/fallback playbook and validate local rehearsal procedure | Provide deterministic rollback triggers, execution commands, and post-rollback verification checklist proven on local runtime. |
| MC-460 | DONE | 3 | Publish operations runbook for queue congestion dead-letter replay watchdog incidents and release readiness | Deliver operator runbook and handoff checklist that a non-implementing engineer can execute end-to-end. |

### MC-415 — Bootstrap deterministic local Docker runtime (api/web/worker/redis/sqlite + Dapr)

| Task | Status | Priority | Title | Objective |
|---|---|---:|---|---|
| MC-417 | DONE | — | Draft runtime spec and bootstrap assets | — |
| MC-418 | DONE | — | Add deterministic local runtime compose stack with health checks | — |
| MC-419 | DONE | — | Add operator lifecycle scripts and env template defaults | — |
| MC-420 | DONE | — | Document local runtime usage and unhealthy-state triage | — |
| MC-421 | DONE | — | Run quality gates for api/web and runtime smoke checks | — |

### MC-416 — Web timeline UX for orchestration runs (filters, drill-down, failure context)

| Task | Status | Priority | Title | Objective |
|---|---|---:|---|---|
| MC-446 | DONE | 2 | Implement filters and drill-down with copyable correlation/causation identifiers | Support status/run_id/time/failure-category filters and event detail drawer/panel with copy actions. |
| MC-447 | DONE | 1 | Build run timeline page with data-fetch layer and resilient loading/empty/error UX | Create orchestration timeline route that loads runs/timeline/attempts and handles operator states cleanly. |
| MC-448 | DONE | 3 | Add tests and walkthrough doc for failure triage using timeline UX | Cover filtering/marker behavior in tests and document a failure triage walkthrough for operators. |

### MC-461 — WEB: Timeline uses limit=200 and gets 422 from API

_No tasks linked._

## 5) Runtime and infra state (current)

Mission Control now runs with **two separated environments** plus local runtime:

- **DEV**: `infra/dev/docker-compose.yml` + `infra/dev/.env(.example)`
  - Full containerized dev runtime (api/web/worker/redis/postgres + Dapr sidecars).
- **PROD**: `infra/prod/docker-compose.prod.yml` + `/etc/mission-control/prod.env` (from `infra/env/prod.env.example`)
  - Full container stack, managed by `infra/systemd/mission-control-prod.service`.
- **Local runtime**: `infra/dev/docker-compose.yml` + `infra/dev/.env(.example)`
  - Deterministic stack for end-to-end orchestration smoke scenarios.

Database defaults in runtime configs are PostgreSQL (`MC_API_DB_ENGINE=postgres`, `MC_API_POSTGRES_DSN=...`).

## 6) Cleanup completed (2026-03-11)

Removed obsolete infra artifacts that were stale after PostgreSQL/container migration:

- `infra/dev/scripts/sqlite-backup.sh`
- `infra/dev/scripts/sqlite-restore.sh`
- `infra/mission-control.service`
- `infra/mission-control-api.service`

These removals are complete in repo history; this section is retained as historical cleanup record.
Documentation and references were updated accordingly (README, REPO_MAP, runtime notes).

## 7) Notes

- Historical story/task names still contain “SQLite” in MC-369/MC-415 because these are immutable backlog records from the implementation timeline.
- API keeps SQLite compatibility code paths in `services/api/app/shared/db/` for backward compatibility, but active runtime/deploy path is PostgreSQL.

