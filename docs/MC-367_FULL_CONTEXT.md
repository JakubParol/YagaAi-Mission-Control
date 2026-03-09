# MC-367 — Full Project Context (DB-grounded)

> Źródło prawdy: SQLite planning DB (`/home/kuba/mission-control/data/mission-control.db`) + repo docs (`infra/local-runtime`, `apps/cli`, `docs/MC-379_ROLLOUT_OPERATIONS_RUNBOOK.md`).
> Wygenerowano: 2026-03-09 07:38:37Z (UTC)

## 1) Po co ten projekt (cel biznesowo-techniczny)

Celem MC-367 jest zbudowanie **deterministycznego, lokalnego runtime’u orkiestracji** dla Mission Control opartego o Docker + Redis + Dapr, z trwałym eventingiem, watchdogiem i pełną obserwowalnością operatorską. W praktyce:

- odpalasz stack lokalnie jednym poleceniem,
- workflow są napędzane zdarzeniami i odporne na restarty/błędy,
- masz timeline, metryki i CLI do diagnozy/retry,
- możesz bezpiecznie rolloutować zmiany (feature flags + runbook).

## 2) Epic MC-367 (pełny rekord z bazy)

- **Epic key:** MC-367
- **Title:** Mission Control on OpenClaw: Local Runtime on Docker + Event-Driven Orchestration (Redis/Dapr)
- **Status:** TODO
- **Priority:** 1
- **Created at:** 2026-03-07T13:51:07.348002+00:00
- **Updated at:** 2026-03-07T17:49:38.612822+00:00

### Opis epiku (oryginał z DB)

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

## 3) Co było i co już zostało dostarczone

Ten refactor przeorał Mission Control z „działa/nie działa” w stronę pełnego runtime’u event-driven. Na dziś z backlogu MC-367:

- **US łącznie:** 13
- **DONE:** 12
- **IN_PROGRESS:** 1
- **TODO:** 0
- **BLOCKED:** 0

Największe domknięte obszary:

- bootstrap lokalnego runtime’u (Docker + health gates),
- migracje/durability SQLite + backup/restore,
- versioned event contract + transactional outbox,
- Redis stream topology + retry/dead-letter,
- Dapr bridge (pub/sub, invocation, state),
- state machine workera + watchdog,
- API read model timeline + Web UX + CLI run submit/status/tail,
- smoke suite (happy path + failure-path).

## 4) Do czego dążymy (target operating model)

Docelowo Mission Control ma działać jako **lokalny, powtarzalny system orkiestracji**:

1. Komenda trafia do API.
2. API waliduje payload i atomowo zapisuje command + outbox event.
3. Event idzie przez Redis/Dapr do workera.
4. Worker wykonuje przejścia state machine z guardrails.
5. Watchdog pilnuje lease/heartbeat/timeout i wyzwala policyjne akcje.
6. API/Web/CLI czytają timeline i metryki do triage/operacji.

## 5) Jak używać (operator quickstart)

### Start lokalnego runtime

```bash
./infra/local-runtime/up.sh
```

### Stop / reset

```bash
./infra/local-runtime/down.sh   # zatrzymaj, zachowaj stan
./infra/local-runtime/reset.sh  # zatrzymaj i wyczyść wolumeny
```

### Smoke test orkiestracji

```bash
./infra/local-runtime/scripts/orchestration-smoke.py
./infra/local-runtime/scripts/orchestration-smoke.py --skip-up
```

### Backup / restore SQLite

```bash
./infra/local-runtime/scripts/sqlite-backup.sh
./infra/local-runtime/scripts/sqlite-restore.sh <plik-backupu.db>
```

### CLI (host-only, bez konteneryzacji)

```bash
mc run submit --run-id local-run-123
mc run status --run-id local-run-123 --output json
mc run tail --run-id local-run-123 --max-polls 5 --interval-ms 2000 --output json
mc run metrics --output json
```

### Feature flags rollout (MC-379)

```bash
MC_API_ORCHESTRATION_COMMANDS_ENABLED=true
MC_API_ORCHESTRATION_DAPR_INGEST_ENABLED=true
MC_API_ORCHESTRATION_WATCHDOG_ENABLED=true
```

## 6) Co zrobiliśmy — pełny rozpad US + taski (z DB)

### 6.1 Snapshot US

| US | Status | Typ | Tytuł | Started | Completed |
|---|---|---|---|---|---|
| MC-369 | DONE | USER_STORY | Harden SQLite local durability: migrations, persistence, and recovery | 2026-03-07T19:15:53.097201+00:00 | 2026-03-08T08:32:05.807822+00:00 |
| MC-370 | DONE | USER_STORY | Define versioned orchestration event contract + transactional outbox | 2026-03-08T09:12:05.916816+00:00 | 2026-03-08T10:12:44.466003+00:00 |
| MC-371 | DONE | USER_STORY | Implement Redis stream topology with retries and dead-letter semantics | 2026-03-08T12:11:36.604498+00:00 | 2026-03-08T12:32:38.095056+00:00 |
| MC-372 | DONE | USER_STORY | Wire Dapr components for pub/sub, state, and service invocation | 2026-03-08T13:14:59.915552+00:00 | 2026-03-08T13:29:47.245050+00:00 |
| MC-373 | DONE | USER_STORY | Build orchestration worker state machine with guarded transitions | 2026-03-08T13:50:38.074183+00:00 | 2026-03-08T14:02:28.009306+00:00 |
| MC-374 | DONE | USER_STORY | Implement watchdog for stale leases, heartbeat loss, and run timeouts | 2026-03-08T15:00:08.886472+00:00 | 2026-03-08T15:09:11.160715+00:00 |
| MC-375 | DONE | USER_STORY | Expose run timeline read model API for status and event history | 2026-03-08T17:05:40.902555+00:00 | 2026-03-08T17:15:08.414907+00:00 |
| MC-376 | DONE | USER_STORY | Extend CLI with run submit/status/tail commands over orchestration APIs | 2026-03-08T17:40:25.748863+00:00 | 2026-03-08T17:46:10.597817+00:00 |
| MC-377 | DONE | USER_STORY | Ship observability baseline: structured logs, core metrics, and trace correlation | 2026-03-08T18:35:28.130052+00:00 | 2026-03-08T18:50:44.984211+00:00 |
| MC-378 | DONE | USER_STORY | Build end-to-end orchestration smoke suite with failure-path coverage | 2026-03-08T18:53:44.499556+00:00 | 2026-03-08T19:01:50.175608+00:00 |
| MC-379 | IN_PROGRESS | USER_STORY | Document rollout controls, rollback playbook, and operations runbook | 2026-03-08T19:37:59.439050+00:00 | — |
| MC-415 | DONE | USER_STORY | Bootstrap deterministic local Docker runtime (api/web/worker/redis/sqlite + Dapr) | 2026-03-07T18:42:28.297362+00:00 | 2026-03-07T19:02:26.942130+00:00 |
| MC-416 | DONE | USER_STORY | Web timeline UX for orchestration runs (filters, drill-down, failure context) | 2026-03-08T17:18:10.001824+00:00 | 2026-03-08T17:32:37.973241+00:00 |

### MC-369 — Harden SQLite local durability: migrations, persistence, and recovery (DONE)

- **Intent:** Guarantee reproducible schema lifecycle and safe local state recovery for orchestration runs.
- **Status:** DONE
- **Priority:** 2
- **Created:** 2026-03-07T13:51:07.553494+00:00
- **Updated:** 2026-03-08T08:32:05.807839+00:00
- **Started:** 2026-03-07T19:15:53.097201+00:00
- **Completed:** 2026-03-08T08:32:05.807822+00:00

**Opis US (DB):**

Scope:
- Standardize SQLite file layout, volume mounts, and migration directory conventions.
- Run migrations automatically on startup with strict failure handling and rollback rules.
- Add backup/restore workflow for replaying local incidents and debugging regressions.
- Define corruption/missing-file handling with explicit operator guidance.

Acceptance Criteria:
1. Startup applies pending migrations idempotently and blocks runtime on migration failure.
2. Run/event data persists across container restarts exactly as documented.
3. Backup and restore process is executable end-to-end with verification steps.
4. Corrupt or missing DB states produce deterministic, actionable diagnostics.

**Taski (3):**

| Task | Status | Pri | Tytuł | Objective | Started | Completed |
|---|---|---:|---|---|---|---|
| MC-422 | DONE | 1 | Build SQLite migration + integrity guardrails in API startup | Introduce ordered migration runner with migration ledger, strict startup failure, and corruption diagnostics. | 2026-03-07T19:15:53.174566+00:00 | 2026-03-07T20:23:30.658890+00:00 |
| MC-423 | DONE | 2 | Add backup/restore tooling and durability docs for local runtime | Provide reproducible backup and recovery scripts plus operator docs for missing/corrupt DB scenarios. | 2026-03-07T20:23:30.656689+00:00 | 2026-03-07T20:23:47.456051+00:00 |
| MC-424 | DONE | 3 | Add integration tests covering migration idempotency and corruption handling | Validate startup migration application, persisted schema evolution, and deterministic failure on corrupt database files. | 2026-03-07T20:23:30.658854+00:00 | 2026-03-07T20:23:47.511312+00:00 |

### MC-370 — Define versioned orchestration event contract + transactional outbox (DONE)

- **Intent:** Ensure event publication is durable, evolvable, and safe under partial failure.
- **Status:** DONE
- **Priority:** 3
- **Created:** 2026-03-07T13:51:07.711324+00:00
- **Updated:** 2026-03-08T10:12:44.466016+00:00
- **Started:** 2026-03-08T09:12:05.916816+00:00
- **Completed:** 2026-03-08T10:12:44.466003+00:00

**Opis US (DB):**

Scope:
- Finalize canonical event envelope and command/event taxonomy with schema versioning.
- Implement API-side validation for emitted event payloads and required metadata.
- Persist outgoing events via transactional outbox (or equivalent) before broker publish.
- Add compatibility tests for reader/writer version drift.

Acceptance Criteria:
1. Every emitted event includes required envelope fields and explicit `schema_version`.
2. API write + outbox persistence is atomic for accepted orchestration commands.
3. Invalid payloads fail validation with machine-actionable error details.
4. Compatibility tests cover backward-compatible schema evolution scenarios.

**Taski (3):**

| Task | Status | Pri | Tytuł | Objective | Started | Completed |
|---|---|---:|---|---|---|---|
| MC-425 | DONE | 1 | Define orchestration envelope and command/event schema contract | Add domain/API contract for versioned orchestration envelopes with required metadata and taxonomy constraints. | 2026-03-08T09:12:47.337636+00:00 | 2026-03-08T09:18:22.649375+00:00 |
| MC-426 | DONE | 3 | Add compatibility and validation tests for version drift and failure paths | Cover schema-version compatibility, validation details, and no-partial-write behavior on rejected payloads. | 2026-03-08T09:58:35.280944+00:00 | 2026-03-08T10:05:34.765795+00:00 |
| MC-427 | DONE | 2 | Implement transactional outbox persistence for accepted orchestration commands | Persist command and outbox event atomically via repository transaction and add migration/indexes for outbox table. | 2026-03-08T09:18:28.927034+00:00 | 2026-03-08T09:58:11.645493+00:00 |

### MC-371 — Implement Redis stream topology with retries and dead-letter semantics (DONE)

- **Intent:** Provide reliable, inspectable event transport with bounded retry behavior.
- **Status:** DONE
- **Priority:** 4
- **Created:** 2026-03-07T13:51:07.847373+00:00
- **Updated:** 2026-03-08T12:32:38.095069+00:00
- **Started:** 2026-03-08T12:11:36.604498+00:00
- **Completed:** 2026-03-08T12:32:38.095056+00:00

**Opis US (DB):**

Scope:
- Define stream keys, consumer groups, and partitioning strategy for orchestration domains.
- Implement ack/retry policy with bounded attempts and backoff metadata.
- Route exhausted events to dead-letter stream with replay metadata.
- Add restart/rebalance behavior for consumer offset recovery.

Acceptance Criteria:
1. Producers/consumers use documented stream and consumer-group contracts.
2. Duplicate deliveries are handled idempotently without invalid state transitions.
3. Retry and dead-letter paths preserve error context and are queryable.
4. Consumer restart resumes processing from correct offsets without data loss.

**Taski (4):**

| Task | Status | Pri | Tytuł | Objective | Started | Completed |
|---|---|---:|---|---|---|---|
| MC-428 | DONE | 1 | Design and codify Redis stream topology + consumer-group contracts | Define stream keys, consumer groups, partitioning strategy, and contract docs/config so producers and consumers use a consistent topology. | 2026-03-08T12:12:25.933070+00:00 | 2026-03-08T12:14:09.562512+00:00 |
| MC-429 | DONE | 4 | Harden restart/rebalance offset recovery and idempotent delivery handling | Ensure consumer restart and rebalance resume from correct offsets and duplicate deliveries are idempotently ignored; cover with integration tests. | 2026-03-08T12:22:45.234652+00:00 | 2026-03-08T12:25:00.842008+00:00 |
| MC-430 | DONE | 3 | Route exhausted events to dead-letter stream with replay context | Publish failed-after-max-attempt events to dead-letter stream preserving error details, causation/correlation IDs, and replay metadata for operators. | 2026-03-08T12:18:31.707226+00:00 | 2026-03-08T12:22:36.487069+00:00 |
| MC-432 | DONE | 2 | Implement ack/retry policy with bounded attempts and backoff metadata | Add consumer processing flow that tracks attempt count, applies deterministic retry/backoff metadata, and acknowledges only on successful state transitions. | 2026-03-08T12:14:26.577411+00:00 | 2026-03-08T12:18:15.266507+00:00 |

### MC-372 — Wire Dapr components for pub/sub, state, and service invocation (DONE)

- **Intent:** Abstract infrastructure dependencies with Dapr while preserving deterministic local behavior.
- **Status:** DONE
- **Priority:** 5
- **Created:** 2026-03-07T13:51:07.979205+00:00
- **Updated:** 2026-03-08T13:29:47.245062+00:00
- **Started:** 2026-03-08T13:14:59.915552+00:00
- **Completed:** 2026-03-08T13:29:47.245050+00:00

**Opis US (DB):**

Scope:
- Configure Dapr components for Redis pub/sub and state store in local environment.
- Integrate API and worker paths through Dapr publish/subscribe and invocation endpoints.
- Validate component bootstrapping and sidecar readiness checks in compose runtime.
- Document local component versioning and override strategy.

Acceptance Criteria:
1. Dapr sidecars start with valid component manifests without manual edits.
2. API and worker can exchange orchestration events through Dapr paths end-to-end.
3. Component initialization failures fail fast and expose root-cause diagnostics.
4. Component configuration is version-controlled and reproducible across machines.

**Taski (3):**

| Task | Status | Pri | Tytuł | Objective | Started | Completed |
|---|---|---:|---|---|---|---|
| MC-433 | DONE | 2 | Implement API-worker Dapr pub/sub + invocation + state exchange path | Add Dapr subscription/invocation endpoints and worker runtime logic so orchestration events flow worker->pubsub->api and acknowledgements flow api->invocation->worker with state-store persistence. | 2026-03-08T13:15:53.080806+00:00 | 2026-03-08T13:25:51.733026+00:00 |
| MC-434 | DONE | 3 | Cover Dapr bridge with tests and update runtime docs/contracts | Add API tests for Dapr endpoints and document component version/override strategy plus operator troubleshooting for reproducible local runtime behavior. | 2026-03-08T13:26:03.434459+00:00 | 2026-03-08T13:28:34.515518+00:00 |
| MC-435 | DONE | 1 | Harden local Dapr component/runtime bootstrap and readiness diagnostics | Parameterize Dapr component/runtime versions in local compose, ensure manifests mount cleanly, and fail fast with root-cause diagnostics when sidecars/components are unhealthy. | 2026-03-08T13:14:59.952967+00:00 | 2026-03-08T13:15:46.913135+00:00 |

### MC-373 — Build orchestration worker state machine with guarded transitions (DONE)

- **Intent:** Execute workflow runs deterministically from events while preventing illegal lifecycle mutations.
- **Status:** DONE
- **Priority:** 6
- **Created:** 2026-03-07T13:51:08.115134+00:00
- **Updated:** 2026-03-08T14:02:28.009319+00:00
- **Started:** 2026-03-08T13:50:38.074183+00:00
- **Completed:** 2026-03-08T14:02:28.009306+00:00

**Opis US (DB):**

Scope:
- Implement worker loop that consumes commands/events and drives run/step transitions.
- Enforce transition guardrails with explicit state-machine rules and rejection paths.
- Persist timeline entries for accepted and rejected transitions.
- Implement crash-safe startup reconciliation for in-flight runs.

Acceptance Criteria:
1. Worker processes lifecycle events and reaches terminal states deterministically.
2. Illegal transitions are rejected with correlation-rich diagnostics and no state corruption.
3. Timeline ledger records lifecycle decisions (including rejects/retries).
4. Worker restart reconciles in-flight runs without duplicate completion/failure outcomes.

**Taski (3):**

| Task | Status | Pri | Tytuł | Objective | Started | Completed |
|---|---|---:|---|---|---|---|
| MC-436 | DONE | 1 | Implement orchestration run/step state machine with guarded transition validator | Add deterministic transition engine that applies legal run and step lifecycle transitions and rejects illegal mutations without persisting invalid state. | 2026-03-08T13:50:42.293169+00:00 | 2026-03-08T13:59:30.409228+00:00 |
| MC-437 | DONE | 2 | Persist timeline ledger entries for accepted/rejected lifecycle decisions | Record transition outcomes with correlation-rich diagnostics for both successful transitions and rejected lifecycle events. | 2026-03-08T13:59:30.433445+00:00 | 2026-03-08T13:59:38.814423+00:00 |
| MC-438 | DONE | 3 | Add crash-safe worker startup reconciliation and duplicate-outcome protection tests | Reconcile in-flight runs on worker startup and ensure terminal completion/failure outcomes are not duplicated across retries/restarts. | 2026-03-08T13:59:30.420286+00:00 | 2026-03-08T13:59:30.443288+00:00 |

### MC-374 — Implement watchdog for stale leases, heartbeat loss, and run timeouts (DONE)

- **Intent:** Recover safely from hung/orphaned executions and enforce runtime SLAs.
- **Status:** DONE
- **Priority:** 7
- **Created:** 2026-03-07T13:51:08.244428+00:00
- **Updated:** 2026-03-08T15:09:11.160726+00:00
- **Started:** 2026-03-08T15:00:08.886472+00:00
- **Completed:** 2026-03-08T15:09:11.160715+00:00

**Opis US (DB):**

Scope:
- Track heartbeat and lease ownership for active runs.
- Detect stale ownership, timeout violations, and orphaned executions.
- Trigger deterministic watchdog actions (retry, fail, quarantine) with audit events.
- Protect watchdog mutations with lease-token compare-and-set semantics.

Acceptance Criteria:
1. Orphaned/stale runs are detected within configured watchdog thresholds.
2. Timeout handling applies deterministic policy (retry/fail/quarantine) per run type.
3. Watchdog actions are emitted as first-class events and visible in timelines.
4. Concurrency controls prevent conflicting watchdog actions on the same run.

**Taski (3):**

| Task | Status | Pri | Tytuł | Objective | Started | Completed |
|---|---|---:|---|---|---|---|
| MC-439 | DONE | 1 | Add watchdog lease and heartbeat tracking with stale detection thresholds | Persist watchdog lease owner/token/heartbeat timestamps and detect stale/orphaned runs within configured thresholds. | 2026-03-08T15:00:16.794994+00:00 | 2026-03-08T15:07:32.604620+00:00 |
| MC-440 | DONE | 2 | Implement deterministic watchdog timeout policy actions with timeline events | Apply deterministic retry/fail/quarantine policy for timeout violations and emit first-class timeline watchdog events. | 2026-03-08T15:07:32.664634+00:00 | 2026-03-08T15:07:45.339004+00:00 |
| MC-441 | DONE | 3 | Protect watchdog mutations with lease-token compare-and-set concurrency guards | Ensure conflicting watchdog actions on the same run are prevented using lease-token CAS semantics and tested for races. | 2026-03-08T15:07:32.665481+00:00 | 2026-03-08T15:07:45.421712+00:00 |

### MC-375 — Expose run timeline read model API for status and event history (DONE)

- **Intent:** Provide stable query surfaces for operators, web UI, and CLI diagnostics.
- **Status:** DONE
- **Priority:** 8
- **Created:** 2026-03-07T13:51:08.389067+00:00
- **Updated:** 2026-03-08T17:15:08.414916+00:00
- **Started:** 2026-03-08T17:05:40.902555+00:00
- **Completed:** 2026-03-08T17:15:08.414907+00:00

**Opis US (DB):**

Scope:
- Implement read endpoints for run state, attempts, event history, and watchdog actions.
- Support filtering by run_id, status, time range, and event type.
- Define ordering/pagination semantics for long-running timelines.
- Specify API contract guarantees for correlation and causation identifiers.

Acceptance Criteria:
1. API returns ordered timeline data with deterministic pagination semantics.
2. Required filters support operational triage use-cases without direct DB access.
3. Correlation/causation identifiers are present and consistent across responses.
4. Contract tests validate shape and backward-compatible response changes.

**Taski (3):**

| Task | Status | Pri | Tytuł | Objective | Started | Completed |
|---|---|---:|---|---|---|---|
| MC-442 | DONE | 1 | Design and implement run timeline read-model endpoints for run state/attempts/events/watchdog actions | Add API/application/infrastructure read path for timeline entities with stable response envelope. | 2026-03-08T17:06:49.807544+00:00 | 2026-03-08T17:13:15.458636+00:00 |
| MC-443 | DONE | 3 | Add contract/integration tests for timeline response shape and correlation-causation identifiers | Verify backward-compatible response schema and identifier consistency across timeline read APIs. | 2026-03-08T17:13:15.358129+00:00 | 2026-03-08T17:13:15.448399+00:00 |
| MC-445 | DONE | 2 | Implement filter and deterministic pagination semantics for timeline queries | Support run_id/status/time-range/event-type filters and deterministic ordering with limit/offset pagination. | 2026-03-08T17:13:15.404325+00:00 | 2026-03-08T17:13:15.416069+00:00 |

### MC-376 — Extend CLI with run submit/status/tail commands over orchestration APIs (DONE)

- **Intent:** Provide terminal-first orchestration control and diagnostics without coupling to Docker image workflows.
- **Status:** DONE
- **Priority:** 10
- **Created:** 2026-03-07T13:51:08.563141+00:00
- **Updated:** 2026-03-08T17:46:10.597826+00:00
- **Started:** 2026-03-08T17:40:25.748863+00:00
- **Completed:** 2026-03-08T17:46:10.597817+00:00

**Opis US (DB):**

Scope:
- Add CLI commands for run submission, status inspection, and timeline tailing.
- Support human-readable and JSON outputs with stable schema for automation.
- Align CLI validation/errors with API contract and event model semantics.
- Add examples for local debugging and incident triage flows.

Acceptance Criteria:
1. CLI can submit runs, query status, and stream timeline events end-to-end.
2. JSON output mode is stable and script-friendly for CI/automation.
3. API/contract errors are mapped to explicit CLI exit codes and messages.
4. Command docs cover at least one failure-debug workflow.

**Taski (3):**

| Task | Status | Pri | Tytuł | Objective | Started | Completed |
|---|---|---:|---|---|---|---|
| MC-449 | DONE | 3 | Document run command usage and failure triage workflow | Update CLI docs with orchestration command examples including one failure-debug flow for operators. | 2026-03-08T17:43:33.155107+00:00 | 2026-03-08T17:44:05.136894+00:00 |
| MC-450 | DONE | 2 | Add CLI tests for orchestration commands and API error mapping | Cover happy path and failure cases for run submit/status/tail and validate JSON output compatibility for automation. | 2026-03-08T17:42:16.930952+00:00 | 2026-03-08T17:43:26.334359+00:00 |
| MC-451 | DONE | 1 | Implement CLI orchestration command group for run submit/status/tail | Add mc run submit/status/tail commands mapped to orchestration command and read-model APIs with stable output handling. | 2026-03-08T17:40:35.950458+00:00 | 2026-03-08T17:42:03.198106+00:00 |

### MC-377 — Ship observability baseline: structured logs, core metrics, and trace correlation (DONE)

- **Intent:** Make distributed orchestration behavior diagnosable with minimal setup in local environments.
- **Status:** DONE
- **Priority:** 11
- **Created:** 2026-03-07T13:51:08.694396+00:00
- **Updated:** 2026-03-08T18:50:44.984222+00:00
- **Started:** 2026-03-08T18:35:28.130052+00:00
- **Completed:** 2026-03-08T18:50:44.984211+00:00

**Opis US (DB):**

Scope:
- Enforce structured logging with run/event correlation fields across API, worker, and CLI surfaces.
- Publish core metrics: queue lag, retries, dead-letter count, watchdog interventions, run latency.
- Propagate trace context from command ingress through worker processing.
- Document local observability troubleshooting workflow.

Acceptance Criteria:
1. Core services emit structured logs with consistent correlation identifiers.
2. Metrics for queue health and failure paths are queryable in local runtime.
3. Trace/correlation context survives command -> event -> worker lifecycle.
4. Operators can follow a documented workflow to triage a failed run.

**Taski (3):**

| Task | Status | Pri | Tytuł | Objective | Started | Completed |
|---|---|---:|---|---|---|---|
| MC-452 | DONE | 3 | Update observability docs and troubleshooting workflow for failed run triage | Document metric/log usage and local runtime triage path with concrete failure-debug steps. | 2026-03-08T18:45:27.964099+00:00 | 2026-03-08T18:46:56.131015+00:00 |
| MC-453 | DONE | 2 | Expose orchestration health metrics endpoint and CLI access | Publish queue lag, retries, dead-letter count, watchdog interventions, and run latency metrics via API and CLI. | 2026-03-08T18:41:36.051169+00:00 | 2026-03-08T18:45:17.627667+00:00 |
| MC-454 | DONE | 1 | Implement structured correlation logging across API, worker, and CLI run flows | Emit structured logs with request/run/event correlation fields and preserve causation context through orchestration processing. | 2026-03-08T18:35:58.316907+00:00 | 2026-03-08T18:41:28.779063+00:00 |

### MC-378 — Build end-to-end orchestration smoke suite with failure-path coverage (DONE)

- **Intent:** Continuously validate runtime correctness for happy path and critical fault scenarios.
- **Status:** DONE
- **Priority:** 12
- **Created:** 2026-03-07T13:51:08.825796+00:00
- **Updated:** 2026-03-08T19:01:50.175617+00:00
- **Started:** 2026-03-08T18:53:44.499556+00:00
- **Completed:** 2026-03-08T19:01:50.175608+00:00

**Opis US (DB):**

Scope:
- Implement smoke suite that boots stack and executes representative workflow runs.
- Cover retry, timeout, dead-letter, and watchdog recovery scenarios.
- Add deterministic fixtures/seeds for repeatable local + CI runs.
- Standardize failure output to identify implicated component quickly.

Acceptance Criteria:
1. Suite validates happy path plus at least three failure-path scenarios.
2. Test results are reproducible in local and CI environments.
3. Failures emit actionable diagnostics (scenario, service, correlation identifiers).
4. Runtime is practical for daily engineering use.

**Taski (3):**

| Task | Status | Pri | Tytuł | Objective | Started | Completed |
|---|---|---:|---|---|---|---|
| MC-455 | DONE | 1 | Implement deterministic orchestration smoke harness for local-runtime and CI | Add executable smoke entrypoint that runs end-to-end orchestration scenarios with stable setup and teardown semantics. | 2026-03-08T18:53:52.292454+00:00 | 2026-03-08T18:57:31.577306+00:00 |
| MC-456 | DONE | 2 | Add failure-path scenarios covering retry, dead-letter, and watchdog timeout recovery | Extend smoke suite with at least three deterministic fault scenarios validating critical orchestration resilience paths. | 2026-03-08T18:57:31.669062+00:00 | 2026-03-08T18:59:32.428991+00:00 |
| MC-457 | DONE | 3 | Standardize smoke diagnostics and usage docs for daily operator workflows | Emit actionable failure diagnostics (scenario, service, correlation IDs) and document local/CI execution with expected runtime. | 2026-03-08T18:59:32.509795+00:00 | 2026-03-08T19:00:14.958371+00:00 |

### MC-379 — Document rollout controls, rollback playbook, and operations runbook (IN_PROGRESS)

- **Intent:** Enable safe staged adoption with clear failure response and rollback guidance.
- **Status:** IN_PROGRESS
- **Priority:** 13
- **Created:** 2026-03-07T13:51:08.957215+00:00
- **Updated:** 2026-03-08T19:37:59.439062+00:00
- **Started:** 2026-03-08T19:37:59.439050+00:00
- **Completed:** —

**Opis US (DB):**

Scope:
- Define feature-flag gates and staged enablement plan for orchestration paths.
- Document rollback triggers, fallback mode, and verification checklist.
- Produce operations runbook for queue congestion, dead-letter replay, watchdog incidents, and recovery.
- Publish release-readiness checklist for team handoff.

Acceptance Criteria:
1. Feature flags support controlled rollout by environment and capability.
2. Rollback/fallback steps are validated at least once in local rehearsal.
3. Runbook includes deterministic procedures for dead-letter replay and watchdog incidents.
4. Release checklist can be executed by an engineer not involved in implementation.

**Taski (3):**

| Task | Status | Pri | Tytuł | Objective | Started | Completed |
|---|---|---:|---|---|---|---|
| MC-458 | DONE | 1 | Define rollout controls and staged enablement matrix for orchestration runtime | Document capability-level feature gates, default states, and per-environment rollout plan with explicit owner checkpoints. | 2026-03-08T19:38:14.369553+00:00 | 2026-03-08T19:49:11.979784+00:00 |
| MC-459 | IN_PROGRESS | 2 | Author rollback/fallback playbook and validate local rehearsal procedure | Provide deterministic rollback triggers, execution commands, and post-rollback verification checklist proven on local runtime. | 2026-03-08T19:49:12.404322+00:00 | — |
| MC-460 | TODO | 3 | Publish operations runbook for queue congestion dead-letter replay watchdog incidents and release readiness | Deliver operator runbook and handoff checklist that a non-implementing engineer can execute end-to-end. | — | — |

### MC-415 — Bootstrap deterministic local Docker runtime (api/web/worker/redis/sqlite + Dapr) (DONE)

- **Intent:** Provide a one-command, reproducible local runtime for orchestration development without dockerizing the CLI tool.
- **Status:** DONE
- **Priority:** 1
- **Created:** 2026-03-07T17:50:05.505393+00:00
- **Updated:** 2026-03-07T19:02:26.942141+00:00
- **Started:** 2026-03-07T18:42:28.297362+00:00
- **Completed:** 2026-03-07T19:02:26.942130+00:00

**Opis US (DB):**

Scope:
- Author compose topology for `api`, `web`, `worker`, `redis`, `sqlite`, and Dapr sidecars.
- Define health/readiness contracts and startup dependency ordering.
- Provide repeatable lifecycle commands (`up`, `down`, `reset`) with environment template defaults.
- Document local failure triage for unhealthy service states.

Acceptance Criteria:
1. Fresh environment can start full stack with one documented command and reach healthy state.
2. Compose health checks gate dependent services and fail fast with actionable diagnostics.
3. Restart/reset flows are deterministic and preserve/clear state as documented.
4. CLI remains host-executed; no CLI container/image build is required by this story.

**Taski (5):**

| Task | Status | Pri | Tytuł | Objective | Started | Completed |
|---|---|---:|---|---|---|---|
| MC-417 | DONE | — | Draft runtime spec and bootstrap assets | — | 2026-03-07T18:43:13.467100+00:00 | 2026-03-07T18:44:04.966997+00:00 |
| MC-418 | DONE | — | Add deterministic local runtime compose stack with health checks | — | 2026-03-07T18:44:13.036505+00:00 | 2026-03-07T18:44:48.228408+00:00 |
| MC-419 | DONE | — | Add operator lifecycle scripts and env template defaults | — | 2026-03-07T18:44:55.105829+00:00 | 2026-03-07T18:45:22.703424+00:00 |
| MC-420 | DONE | — | Document local runtime usage and unhealthy-state triage | — | 2026-03-07T18:45:22.785247+00:00 | 2026-03-07T18:45:28.606978+00:00 |
| MC-421 | DONE | — | Run quality gates for api/web and runtime smoke checks | — | 2026-03-07T18:45:34.158422+00:00 | 2026-03-07T18:48:55.213096+00:00 |

### MC-416 — Web timeline UX for orchestration runs (filters, drill-down, failure context) (DONE)

- **Intent:** Turn run timeline data into an operator workflow that supports fast triage and retry decisions.
- **Status:** DONE
- **Priority:** 9
- **Created:** 2026-03-07T17:50:14.105042+00:00
- **Updated:** 2026-03-08T17:32:37.973253+00:00
- **Started:** 2026-03-08T17:18:10.001824+00:00
- **Completed:** 2026-03-08T17:32:37.973241+00:00

**Opis US (DB):**

Scope:
- Implement run timeline screen consuming read-model APIs (status stream + event history).
- Add filtering by status, run_id, time window, and failure category.
- Provide drill-down with correlation/causation IDs and watchdog/retry markers.
- Define empty/error/loading states with operator-facing troubleshooting hints.

Acceptance Criteria:
1. Operator can find a run and inspect ordered lifecycle events without direct DB/queue access.
2. Retry/watchdog/dead-letter transitions are visually distinct and filterable.
3. Correlation and causation identifiers are visible and copyable for incident workflows.
4. UI behavior is documented with at least one walkthrough for failure triage.

**Taski (3):**

| Task | Status | Pri | Tytuł | Objective | Started | Completed |
|---|---|---:|---|---|---|---|
| MC-446 | DONE | 2 | Implement filters and drill-down with copyable correlation/causation identifiers | Support status/run_id/time/failure-category filters and event detail drawer/panel with copy actions. | 2026-03-08T17:22:39.403082+00:00 | 2026-03-08T17:25:06.173346+00:00 |
| MC-447 | DONE | 1 | Build run timeline page with data-fetch layer and resilient loading/empty/error UX | Create orchestration timeline route that loads runs/timeline/attempts and handles operator states cleanly. | 2026-03-08T17:18:19.455382+00:00 | 2026-03-08T17:22:39.383014+00:00 |
| MC-448 | DONE | 3 | Add tests and walkthrough doc for failure triage using timeline UX | Cover filtering/marker behavior in tests and document a failure triage walkthrough for operators. | 2026-03-08T17:25:06.202555+00:00 | 2026-03-08T17:28:05.694604+00:00 |

## 7) Co jeszcze zostało (realny gap do zamknięcia)

Otwarte rzeczy są skoncentrowane w **MC-379** (rollout/rollback/runbook):

- **US MC-379**: `IN_PROGRESS`
- **MC-458**: DONE (rollout controls + staged matrix)
- **MC-459**: IN_PROGRESS (rollback/fallback playbook + local rehearsal)
- **MC-460**: TODO (operations runbook + release readiness handoff)

Bez domknięcia MC-459/MC-460 system jest technicznie bogaty, ale operacyjnie jeszcze niezamknięty.

## 8) Aktualny problem „nie działa” (kontekst operacyjny z tej sesji)

W tej chwili symptom jest zgodny z Twoim opisem:

- `mc` nie może gadać z API (`TransportError: fetch failed`),
- `mission-control-api.service` jest w pętli restartów (`status=203/EXEC`),
- web na `:3100` działa, ale backend endpointy orchestration/planning padają (500/404 wg ścieżki).

To oznacza, że sama implementacja MC-367 jest szeroka, ale runtime integracyjny po refactorze wymaga naprawy uruchomienia API + env/venv pathing.

## 9) Co dalej (proponowana kolejność domknięcia)

1. Naprawić start API (service unit + interpreter/venv + dependencies).
2. Potwierdzić health (`/healthz`) i połączenie `mc` -> API.
3. Odpalić smoke (`orchestration-smoke.py`) i potwierdzić scenariusze fault-path.
4. Dokończyć MC-459/MC-460 i formalnie zamknąć MC-379/MC-367.
5. Przejść staged enablement matrix przed kolejnym rolloutem.
