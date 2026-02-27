# Auth Approach — Mission Control v1

**Status:** Draft v1.1
**Date:** 2026-02-27
**Applies to:** `services/api` — all modules (planning, observability)

---

## v1: No Auth (Internal Service)

In v1, the API runs as an internal service behind a private network boundary. No authentication or authorization is enforced.

### Caller Identity

Even without auth, we track **who** makes changes:

- Requests may include an `X-Actor-Id` header (agent key or human identifier).
- Requests may include an `X-Actor-Type` header (`human` | `agent` | `system`).
- These values propagate to `created_by`, `updated_by`, and `activity_log.actor_id` / `actor_type`.
- If omitted, actor defaults to `system` / `null`.

This convention is cheap to implement and ensures audit trails are useful from day one.

### Future-Ready Headers

Reserve these headers for future use (ignored in v1, no enforcement):

| Header | Purpose |
|---|---|
| `Authorization` | Bearer token (JWT or API key) |
| `X-Tenant-Id` | Multi-tenancy isolation |
| `X-Idempotency-Key` | Request deduplication (see [Operational](./OPERATIONAL.md)) |

---

## v2+ Auth Plan (Sketch)

When auth is needed:

1. **API keys** for agent-to-API calls (simple, service-to-service).
2. **JWT bearer tokens** for human users (issued by an external identity provider).
3. **RBAC** with roles: `admin`, `member`, `agent`.
4. FastAPI dependency `get_current_user()` in `shared/api/deps.py` — wire it to token validation.
5. Permission checks happen in the application layer (services), not in routers.

No auth code will be written in v1 beyond the actor-identity headers described above.

---

## Navigation

- ↑ [Docs Index](./INDEX.md)
- ← [API Contracts](./API_CONTRACTS.md)
- → [Status Transitions](./STATUS_TRANSITIONS.md)
