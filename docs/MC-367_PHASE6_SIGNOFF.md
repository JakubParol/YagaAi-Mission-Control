# MC-367 Phase 6 — Final Sign-off (SQLite -> PostgreSQL local runtime)

Date: 2026-03-09
Branch: `Migrate-to-Postgres`
PR: https://github.com/JakubParol/YagaAi-Mission-Control/pull/136

## Scope

Phase 6 closes rollout sign-off after Phase 5 completion:

- postgres-first runtime validated,
- smoke + resilience scenarios green,
- runbook executable by non-implementing engineer,
- SQLite removed from default runtime path.

## Validation evidence

### 1) Runtime health

- `GET /healthz` (API): `{"status":"ok"}`
- `GET /healthz/dapr`: `{"status":"ok"}`

Runtime stack healthy (`up.sh` with Dapr metadata checks passed on api/web/worker sidecars).

### 2) Orchestration smoke suite (Postgres path)

Command:

```bash
./infra/local-runtime/scripts/orchestration-smoke.py --skip-up --api-base http://127.0.0.1:5101
```

Result: `suite.result=PASS`, `scenarios_failed=0/4`

- happy_path: PASS
- retry_path: PASS
- dead_letter_path: PASS
- watchdog_timeout_path: PASS

### 3) Timeline/read model visibility

- `GET /v1/orchestration/timeline?limit=5` returns valid records from Postgres-backed runtime.

### 4) Runbook operationality

Updated artifacts:

- `infra/local-runtime/README.md` (postgres-first runtime)
- `docs/MC-379_ROLLOUT_OPERATIONS_RUNBOOK.md` (backup step moved to postgres script)
- `infra/local-runtime/scripts/postgres-backup.sh`
- `infra/local-runtime/scripts/postgres-restore.sh`

### 5) SQLite deprecation in default runtime

Confirmed:

- `sqlite` service removed from `infra/local-runtime/docker-compose.yml`
- `sqlite-data` volume removed from default runtime compose
- no default `/runtime/sqlite` mounts in API/Web runtime
- `mission-control-local-sqlite-*` container absent after `down && up`

## Final status

**SIGN-OFF: APPROVED**

MC-367 local runtime migration to PostgreSQL is complete for default docker runtime path, with smoke and operational runbook gates satisfied.

## Notes / known operational nuance

- Comparing SQLite and Postgres orchestration table counts after cutover will naturally diverge over time because live writes now go to Postgres only.
- Use parity checks for schema and migration gates, not for post-cutover runtime event-count equality.
