# Auth Approach — Mission Control API

**Status:** Active v1 posture
**Applies to:** `services/api` — planning, observability, control-plane

---

## 1) Current state

The API currently runs as an internal service. There is **no user-facing auth enforcement** in v1.

That means:
- no bearer-token gate on normal API routes
- no RBAC checks in the application layer yet
- trust is currently derived from network/runtime placement

This is intentional for the current internal deployment model.

---

## 2) Actor identity headers

Even without auth enforcement, write paths still track **who** initiated a change.

Supported request headers:

| Header | Purpose |
|---|---|
| `X-Actor-Id` | human / agent / system identifier |
| `X-Actor-Type` | `human`, `agent`, or `system` |
| `X-Request-Id` | request correlation / log tracing |

These values are used for request logs and selected audit/activity records.
If omitted, the system falls back to internal defaults.

---

## 3) Reserved future headers

The following are intentionally reserved for future enforcement/use, but are not the primary auth mechanism today:

| Header | Notes |
|---|---|
| `Authorization` | reserved for future bearer-token/API-key enforcement |
| `X-Tenant-Id` | reserved for future multi-tenant isolation |
| `X-Idempotency-Key` | reserved for future POST deduplication semantics |

---

## 4) Expected direction

When stricter auth becomes necessary, the likely order is:

1. API keys for service-to-service calls
2. bearer-token auth for human users
3. application-layer permission checks / roles
4. stronger per-route enforcement and audit rules

That future work should extend this document rather than creating a second auth source of truth.

## Navigation

- ↑ [Docs Index](./INDEX.md)
- ← [API Contracts](./API_CONTRACTS.md)
- → [Status Transitions](./STATUS_TRANSITIONS.md)
