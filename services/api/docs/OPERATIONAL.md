# Operational Notes — Mission Control v1

**Status:** Draft v1.0
**Date:** 2026-02-27
**Applies to:** `services/api`

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
- SQLite serializes writes at the DB level — low risk of lost updates at expected scale.
- Unique constraints (e.g. one active assignment per task, story in max one backlog) catch conflicts → `409 CONFLICT`.

### v2 Plan

- Add `version` integer column to core entities for optimistic locking.
- PATCH requests include `If-Match` header with expected version.
- Mismatches return `409`.

---

## 3) Observability

### Structured Logging

- All logs are JSON-formatted (structured).
- Every request gets a `request_id` (UUID, via `X-Request-Id` header or auto-generated).
- Log fields: `timestamp`, `level`, `request_id`, `method`, `path`, `status_code`, `duration_ms`, `actor_id`.
- Use Python `logging` with a JSON formatter (e.g. `python-json-logger`).

### Health Check

- `GET /healthz` — existing endpoint, returns `{"status": "ok"}`.
- Future: add `/readyz` that checks DB connectivity.

### Metrics (v2)

- Deferred: Prometheus metrics via `prometheus-fastapi-instrumentator` or similar.
- Key metrics: request count, latency histogram, error rate by endpoint.

---

## 4) Audit Hooks

The service layer emits `activity_log` entries for key events:

| Event | `event_name` | Logged data |
|---|---|---|
| Entity created | `{entity}.created` | Entity ID, actor |
| Entity updated | `{entity}.updated` | Changed fields, actor |
| Entity deleted | `{entity}.deleted` | Entity ID, actor |
| Status changed | `{entity}.status.changed` | `from_status`, `to_status`, actor |
| Assignment changed | `task.assigned` / `task.unassigned` | Agent ID, actor |
| Backlog item added/removed | `backlog.item.added` / `backlog.item.removed` | Item ID, backlog ID |

Implementation:
- Service methods call a lightweight `log_activity()` helper after successful DB commits.
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
| Optimistic locking (ETag/version) | SQLite serialization sufficient for v1 | v2 |
| Comments & attachments endpoints | Lower priority, entities exist in DB | v1.1 |
| Agents CRUD | Agents are synced from openclaw.json, read-only in v1 | v1.1 |
| Prometheus metrics | Structured logs sufficient for v1 | v2 |

---

## Navigation

- ↑ [Docs Index](./INDEX.md)
- ← [Status Transitions](./STATUS_TRANSITIONS.md)
- ← [Architecture](./ARCHITECTURE.md)
