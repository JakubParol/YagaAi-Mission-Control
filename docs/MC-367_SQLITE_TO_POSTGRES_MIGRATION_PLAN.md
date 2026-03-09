# MC-367 — Migration Plan: SQLite -> PostgreSQL (Local Docker)

## Status

Decision approved: migrate Mission Control local runtime persistence from SQLite file-based storage to PostgreSQL service-based storage in Docker.

## Why this migration

1. Server-grade DB operations (host/port, roles, tooling, backups) instead of file-level DB access.
2. Better concurrent write/read behavior under orchestration load.
3. Easier operational introspection with standard PostgreSQL tooling.
4. Cleaner path to managed production-grade database offerings later.

## Non-goals (this phase)

1. No immediate move to managed cloud Postgres.
2. No broad domain redesign.
3. No orchestration contract changes unless required by SQL dialect/constraints.

## Target architecture (local)

- New docker service: `postgres`
- Persistent volume: `postgres-data`
- API/Web connect via Postgres DSN (`postgresql://...`)
- SQLite stays temporarily as fallback during transition window

## Phased plan

### Phase 0 — Preconditions & freeze

- Freeze schema changes during migration window.
- Snapshot current SQLite DB (safety checkpoint).
- Confirm current smoke suite is green on baseline.

Exit criteria:
- Baseline and backup captured.

### Phase 1 — Bootstrap PostgreSQL in local runtime

Tasks:
1. Add `postgres` service to `infra/local-runtime/docker-compose.yml`.
2. Define env vars in `.env.example` and `.env`:
   - `MC_POSTGRES_HOST`
   - `MC_POSTGRES_PORT`
   - `MC_POSTGRES_DB`
   - `MC_POSTGRES_USER`
   - `MC_POSTGRES_PASSWORD`
3. Add healthcheck (`pg_isready`).
4. Expose port for local GUI tools (optional but recommended).

Exit criteria:
- Postgres container healthy and reachable.

### Phase 2 — Schema migration path for PostgreSQL

Tasks:
1. Introduce/extend migration runner to support Postgres dialect.
2. Apply all migrations to empty Postgres DB.
3. Validate critical constraints/indexes/foreign keys.

Exit criteria:
- Empty Postgres instance reproduces expected schema with no manual SQL fixes.

### Phase 3 — Data migration from SQLite

Tasks:
1. Export SQLite data (table-ordered extraction with FK-safe order).
2. Transform type differences (booleans, datetime formats, JSON/text fields).
3. Import into Postgres in deterministic sequence.
4. Validate:
   - per-table row counts,
   - key entity spot checks,
   - referential integrity checks.

Exit criteria:
- Data parity checks pass.

### Phase 4 — Application cutover

Tasks:
1. Switch API to Postgres DSN by default in local runtime.
2. Switch Web DB access path to Postgres-compatible layer.
3. Run full quality gates + orchestration smoke + failure-path scenarios.
4. Confirm metrics/timeline/watchdog behavior unchanged functionally.

Exit criteria:
- App and orchestration runtime stable on Postgres.

### Phase 5 — Documentation and ops hardening

Tasks:
1. Update:
   - `infra/local-runtime/README.md`
   - `docs/MC-379_ROLLOUT_OPERATIONS_RUNBOOK.md`
   - backup/restore procedures for Postgres.
2. Add rollback path (Postgres -> SQLite fallback during grace period).
3. Define deprecation date for SQLite local path.

Exit criteria:
- Runbook fully executable by non-implementing engineer.

## Rollback strategy during migration

At any phase before final deprecation:

1. Keep last good SQLite snapshot.
2. Keep feature/env toggle to choose DB backend.
3. If parity/smoke fails after cutover, revert backend selector to SQLite and restart runtime.

## Quality gates (must pass)

1. API health and planning endpoints.
2. CLI operations (`project/epic/story/task` list/get paths).
3. Orchestration smoke suite including failure paths.
4. Timeline and metrics consistency checks.

## Risks & mitigations

### Risk: SQL dialect differences break queries
Mitigation: integration test pass for all planning + orchestration repositories before cutover.

### Risk: data conversion mismatch (timestamps/booleans/json)
Mitigation: explicit transform rules + row-count and semantic spot checks.

### Risk: migration window drifts and scope explodes
Mitigation: strict phased gates, no opportunistic refactors during migration.

## Deliverables checklist

- [ ] Compose includes healthy Postgres service
- [ ] Postgres schema migration path implemented
- [ ] SQLite -> Postgres data migration script/tooling
- [ ] Cutover config defaults to Postgres
- [ ] Smoke + failure-path suite green on Postgres
- [ ] Runbooks updated
- [ ] SQLite fallback/deprecation policy documented
