# MC-379 — Rollout Controls, Rollback Playbook, and Operations Runbook

## Scope

This runbook defines safe rollout controls for orchestration runtime capabilities and
the operating model for staged enablement.

Primary scope:

- capability-level feature flags for command intake, Dapr ingest, and watchdog sweep
- environment-by-environment rollout sequencing with owner checkpoints

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

## Navigation

- ↑ [docs/INDEX.md](./INDEX.md)
- ↑ [AGENTS.md](../AGENTS.md)
