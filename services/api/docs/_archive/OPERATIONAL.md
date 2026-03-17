# Operational Notes — Mission Control v1

**Status:** Draft v1.1
**Date:** 2026-02-27
**Applies to:** `services/api` — all modules (planning, observability)

---

## 1) Idempotency

### v1 Approach

Most operations are naturally idempotent or safe:

- **GET** — safe, no side effects.
- **PATCH** — idempotent by nature (same payload → same result).
- **DELETE** — idempotent (delete of non-existent entity returns `404`, repeated delete is harmless).
- **POST** (create) — not inherently idempotent.

For POST endpoints, clients may send an `X-Idempotency-Key` header. v1 behavior:
- The header is **accepted and logged** but **not enforced** (no dedup storage yet).
- This reserves the convention for v2 enforcement.

### v2 Plan

- Store `(idempotency_key, response)` pairs with a TTL (e.g. 24h).
- Return cached response on duplicate key.

---

## 2) Concurrency

### Optimistic Concurrency (v1)

- No explicit version/ETag fields in v1 entities.
- PostgreSQL is the only supported runtime database for v1 local and production deployments.
- Unique constraints (e.g. one active assignment per task, story in max one backlog) catch conflicts → `409 CONFLICT`.

### v2 Plan

- Add `version` integer column to core entities for optimistic locking.
- PATCH requests include `If-Match` header with expected version.
- Mismatches return `409`.

---

## 3) Logging & Health

### Structured Logging

- All API logs are JSON-formatted (structured) and include an `event` field.
- Every request gets a `request_id` (`X-Request-Id` header or auto-generated UUID) and the response echoes it.
- Request completion/failure logs include: `request_id`, `method`, `path`, `status_code`, `duration_ms`, `actor_id`, `actor_type`, and optional `correlation_id`.
- Control-plane services emit correlation-aware events (`control-plane.command.accepted`, `control-plane.worker.transition_applied`, `control-plane.delivery.retry_scheduled`, `control-plane.delivery.dead_lettered`, `control-plane.watchdog.action_applied`).

### Health Check

- `GET /healthz` — existing endpoint, returns `{"status": "ok"}`.
- Future: add `/readyz` that checks DB connectivity.

### Metrics

- Control-plane operational metrics are exposed via `GET /v1/control-plane/metrics`.
- Current metrics: queue pending + oldest age, retries total, dead-letter total, watchdog interventions, terminal run latency avg/p95.
- This endpoint is intended for local runtime diagnostics and incident triage.

### Trace Context

- Dapr ingress (`POST /v1/control-plane/dapr/events`) propagates `correlation_id` and `causation_id` into worker state-machine timeline writes.
- Fallback behavior: when `data.causation_id` is absent, CloudEvent `traceparent` is used as `causation_id`.

### Rollout controls (MC-379)

Control-plane capability gates are controlled by env flags:

- `MC_API_CONTROL_PLANE_COMMANDS_ENABLED` (default `true`)
- `MC_API_CONTROL_PLANE_DAPR_INGEST_ENABLED` (default `true`)
- `MC_API_CONTROL_PLANE_WATCHDOG_ENABLED` (default `true`)

Gate behavior:

- commands gate OFF: `/v1/control-plane/commands` returns `503`
- Dapr ingest gate OFF:
  - `/dapr/subscribe` returns no subscriptions
  - `/v1/control-plane/dapr/events` returns `status=IGNORED`
- watchdog gate OFF: `/v1/control-plane/watchdog/sweep` returns `503`

---

## 4) Audit Hooks (Planning Module)

The planning module's application layer emits `activity_log` entries for key events:

| Event | `event_name` | Logged data |
|---|---|---|
| Entity created | `{entity}.created` | Entity ID, actor |
| Entity updated | `{entity}.updated` | Changed fields, actor |
| Entity deleted | `{entity}.deleted` | Entity ID, actor |
| Status changed | `{entity}.status.changed` | `from_status`, `to_status`, actor |
| Assignment changed | `task.assigned` / `task.unassigned` | Agent ID, actor |
| Backlog item added/removed | `backlog.item.added` / `backlog.item.removed` | Item ID, backlog ID |
| Epic quick status action | `epic.status.changed` | `from_status`, `to_status`, actor, epic/project scope |
| Story bulk status action | `story.status.changed` | per-story status change, actor, epic-overview scope |
| Story bulk sprint add/remove | `story.sprint_membership.added` / `story.sprint_membership.removed` | per-story movement, actor, backlog scope |

Implementation:
- Application service methods call a lightweight `log_activity()` helper after successful DB commits.
- Activity log writes are best-effort in v1 (failure to log does not roll back the operation).
- Actor identity comes from request headers (`X-Actor-Id`, `X-Actor-Type`).

---

## 5) Out of Scope / Deferred

| Item | Reason | Target |
|---|---|---|
| Auth enforcement | Internal-only service in v1 | v2 |
| WebSocket / real-time events | Not needed yet | v2+ |
| File upload (binary) | Attachments store metadata only | v2+ |
| WIP limits | Deferred per WORKFLOW_LOGIC_V1 | v2 |
| Multi-assignee tasks | Deferred per WORKFLOW_LOGIC_V1 | v2 |
| Full field-level audit logging | Key events only in v1 | v2 |
| Automatic assignment rules | Deferred per WORKFLOW_LOGIC_V1 | v2 |
| Cursor-based pagination | Offset-based is sufficient for v1 scale | v2 |
| Rate limiting | Internal service, low traffic | v2 |
| Idempotency key enforcement | Header reserved, not enforced | v2 |
| Optimistic locking (ETag/version) | PostgreSQL transactional semantics sufficient for v1 | v2 |
| Comments & attachments endpoints | Lower priority, entities exist in DB | v1.1 |
| Agents sync | `POST /v1/planning/agents/sync` upserts/deactivates by OpenClaw config; manual agents remain untouched | v1.1 |
| Prometheus exporter / scraping | JSON/API metrics are sufficient for local runtime v1 | v2 |

---

## Navigation

- ↑ [Docs Index](./INDEX.md)
- ← [Status Transitions](./STATUS_TRANSITIONS.md)
- ← [Architecture](./ARCHITECTURE.md)
