# MC-379 — Rollout Controls, Rollback Playbook, and Operations Runbook

## Scope

This runbook defines safe rollout controls for orchestration runtime capabilities and
the operating model for staged enablement.

Primary scope:

- capability-level feature flags for command intake, Dapr ingest, and watchdog sweep
- environment-by-environment rollout sequencing with owner checkpoints
- deterministic rollback/fallback procedure with rehearsal evidence
- incident runbook for queue congestion, dead-letter replay, and watchdog actions
- release-readiness handoff checklist executable by a non-implementing engineer

## Rollout controls

The API exposes runtime capability flags via environment variables:

- `MC_API_ORCHESTRATION_COMMANDS_ENABLED`
- `MC_API_ORCHESTRATION_DAPR_INGEST_ENABLED`
- `MC_API_ORCHESTRATION_WATCHDOG_ENABLED`

Default values: all `true`.

Behavior when disabled:

- commands disabled:
  - `POST /v1/orchestration/commands` returns `503` with clear capability message
- Dapr ingest disabled:
  - `GET /dapr/subscribe` returns `[]` (no topic subscription)
  - `POST /v1/orchestration/dapr/events` returns `200` with `status=IGNORED` and reason
- watchdog disabled:
  - `POST /v1/orchestration/watchdog/sweep` returns `503` with clear capability message

## Staged enablement matrix

| Stage | Environment | Commands | Dapr ingest | Watchdog | Owner checkpoint | Exit criteria |
|---|---|---:|---:|---:|---|---|
| 0 | Local dev | ON | OFF | OFF | API engineer | Submit/status flow works; no worker-driven transitions expected |
| 1 | Local runtime rehearsal | ON | ON | OFF | Runtime engineer | End-to-end events flow; timeline transitions visible |
| 2 | Local resilience rehearsal | ON | ON | ON | Runtime engineer + reviewer | Retry/dead-letter/watchdog smoke scenarios pass |
| 3 | Shared staging | ON | ON | ON | On-call + release owner | Incident drills complete; release checklist signed |
| 4 | Production | ON | ON | ON | Release owner | Post-release verification complete |

## Configuration examples

Local API `.env.local` / deployment env:

```bash
MC_API_ORCHESTRATION_COMMANDS_ENABLED=true
MC_API_ORCHESTRATION_DAPR_INGEST_ENABLED=false
MC_API_ORCHESTRATION_WATCHDOG_ENABLED=false
```

Local runtime (`infra/local-runtime/.env`) with all capabilities:

```bash
MC_API_ORCHESTRATION_COMMANDS_ENABLED=true
MC_API_ORCHESTRATION_DAPR_INGEST_ENABLED=true
MC_API_ORCHESTRATION_WATCHDOG_ENABLED=true
```

## Rollback and fallback playbook (MC-459)

### Rollback triggers

Start rollback/fallback when any trigger persists after one standard retry cycle:

| Trigger | Signal | Threshold |
|---|---|---|
| Queue congestion | `GET /v1/orchestration/metrics` -> `queue_pending`, `queue_oldest_pending_age_seconds` | pending backlog grows for >= 10 min or oldest pending > 300s |
| Dead-letter growth | `dead_letter_total` grows release-over-release | any unexpected increase during rollout window |
| Watchdog instability | timeline flood of `orchestration.watchdog.action` with repeated RETRY/QUARANTINE | repeated actions on same run without forward progress |
| Ingest instability | repeated `503` from `/v1/orchestration/dapr/events` or `/healthz/dapr` | >= 3 consecutive failures in < 5 min |

### Fallback levels

Apply the least disruptive level first.

| Level | Commands | Dapr ingest | Watchdog | Use when |
|---|---:|---:|---:|---|
| L1 (stabilize) | ON | ON | OFF | watchdog churn without core ingest failure |
| L2 (drain) | ON | OFF | OFF | ingest path unstable, keep manual command intake |
| L3 (freeze) | OFF | OFF | OFF | severe incident, prevent new orchestration mutations |

### Execution steps

1. Freeze change window and announce incident channel ownership.
2. Create verified DB backup:
```bash
./infra/local-runtime/scripts/postgres-backup.sh
```
3. Set fallback flags in runtime env (`infra/local-runtime/.env`) or deployment env:
```bash
MC_API_ORCHESTRATION_COMMANDS_ENABLED=<true|false>
MC_API_ORCHESTRATION_DAPR_INGEST_ENABLED=<true|false>
MC_API_ORCHESTRATION_WATCHDOG_ENABLED=<true|false>
```
4. Restart API and worker path:
```bash
docker compose -f infra/local-runtime/docker-compose.yml --env-file infra/local-runtime/.env restart api dapr-api worker dapr-worker
```
5. Validate capability gates:
```bash
API_BASE=http://127.0.0.1:${MC_API_PORT:-5001}
curl -sS "${API_BASE}/healthz"
curl -sS "${API_BASE}/v1/orchestration/metrics"
```
6. Confirm expected gate behavior:
- commands OFF: `POST /v1/orchestration/commands` returns `503`
- ingest OFF: `/dapr/subscribe` empty and Dapr event ingress returns `status=IGNORED`
- watchdog OFF: `POST /v1/orchestration/watchdog/sweep` returns `503`

### Post-rollback verification checklist

- API and worker containers healthy (`docker compose ... ps`).
- `queue_oldest_pending_age_seconds` no longer increasing.
- no new unexpected dead-letter growth.
- manual run submit path (if Commands ON) accepted and visible in run read model.
- incident timeline captured with correlation IDs and chosen fallback level.

### Local rehearsal evidence

Validated on 2026-03-09 (UTC) using deterministic smoke suite:

```bash
./infra/local-runtime/scripts/orchestration-smoke.py --skip-up --api-base http://127.0.0.1:5101
```

Observed result:
- `happy_path`: PASS
- `retry_path`: PASS (`retry_attempt=2`)
- `dead_letter_path`: PASS (`dead_letter_total=1`)
- `watchdog_timeout_path`: PASS (`watchdog_action=RETRY`)
- `suite.result`: PASS (`scenarios_failed=0`)

Note: smoke default is `http://127.0.0.1:5001`; this environment exposes API on port `5101` (`MC_API_PORT=5101`), so `--api-base` was required.

## Operations runbook (MC-460)

### Baseline diagnostics

Use API-first checks (no dependency on `mc` CLI):

```bash
API_BASE=http://127.0.0.1:${MC_API_PORT:-5001}
curl -sS "${API_BASE}/healthz"
curl -sS "${API_BASE}/healthz/dapr"
curl -sS "${API_BASE}/v1/orchestration/metrics"
curl -sS "${API_BASE}/v1/orchestration/runs?limit=20"
curl -sS "${API_BASE}/v1/orchestration/timeline?limit=50"
```

For container triage:
```bash
docker compose -f infra/local-runtime/docker-compose.yml --env-file infra/local-runtime/.env ps
docker compose -f infra/local-runtime/docker-compose.yml --env-file infra/local-runtime/.env logs api worker dapr-api dapr-worker --tail=200
```

### Scenario A: queue congestion

1. Confirm congestion from metrics (`queue_pending`, `queue_oldest_pending_age_seconds`).
2. Verify Redis/API/worker/Dapr health.
3. If worker path unhealthy, restart only worker + sidecar first.
4. If congestion persists, move to fallback level L2 (disable ingest) and drain queue.
5. Re-enable ingest only after pending age trends down and no new dead-letter spikes.

### Scenario B: dead-letter replay

1. Identify affected run:
```bash
curl -sS "${API_BASE}/v1/orchestration/runs/<run_id>/attempts?limit=20"
```
2. Confirm failed attempt (`status=FAILED`, `dead_lettered_at` set).
3. Capture failure context (`outbox_event_id`, `correlation_id`, error message).
4. Submit replay command with new `run_id` and causal link:
```bash
curl -sS -X POST "${API_BASE}/v1/orchestration/commands" \
  -H "Content-Type: application/json" \
  -d '{
    "command_type":"orchestration.run.submit",
    "schema_version":"1.0",
    "payload":{"run_id":"<original-run-id>-replay-<timestamp>"},
    "metadata":{
      "producer":"operations-runbook",
      "correlation_id":"<new-or-linked-correlation-id>",
      "causation_id":"<dead-letter-outbox-event-id>",
      "occurred_at":"<iso8601>"
    }
  }'
```
5. Verify replay run transitions from `PENDING` and does not dead-letter again.

### Scenario C: watchdog incidents

1. Filter timeline on watchdog events:
```bash
curl -sS "${API_BASE}/v1/orchestration/timeline?event_type=orchestration.watchdog.action&limit=50"
```
2. Inspect run state (`watchdog_state`, `watchdog_attempt`, heartbeat fields).
3. Trigger one controlled sweep for deterministic decision capture:
```bash
curl -sS -X POST "${API_BASE}/v1/orchestration/watchdog/sweep" \
  -H "Content-Type: application/json" \
  -d '{"watchdog_instance":"ops-manual","evaluated_at":"<iso8601>"}'
```
4. If repeated quarantine/fail continues without service recovery, set fallback L1 (watchdog OFF), stabilize ingest, then re-enable watchdog after root-cause fix.

### Recovery completion criteria

- No active incident alerts in queue/dead-letter/watchdog signals.
- Last replayed run reaches terminal success or accepted business fallback state.
- Capability flags returned to target rollout stage.
- Incident notes include timeline IDs, correlation IDs, and remediation timestamps.

## Release-readiness handoff checklist

This checklist is designed for an engineer who did not implement the feature.

1. Verify capability flags for target stage (`Commands`, `Dapr ingest`, `Watchdog`).
2. Run smoke suite against target API base and confirm `suite.result=PASS`.
3. Validate metrics endpoint is reachable and values are plausible.
4. Execute one read-only timeline drill (`/v1/orchestration/timeline`) and confirm watchdog/dead-letter visibility.
5. Execute one rollback simulation (at least L1) and revert to target stage.
6. Confirm backup/restore scripts run and latest verified backup exists.
7. Record release sign-off with operator name, timestamp, and rollback level tested.

## Navigation

- ↑ [docs/INDEX.md](./INDEX.md)
- ↑ [AGENTS.md](../AGENTS.md)
