# Coding Standards — Backend

Extends [coding-standards.md](./coding-standards.md). Everything in the parent applies here.

---

## Architecture

- **Clean Architecture, package by feature.** Group by domain concept, not by technical layer.
- **Dependency rule:** dependencies point inward only. Infrastructure → Application → Domain, never the reverse.
- **Ports & Adapters:** Application defines interfaces (ports). Infrastructure implements them. Wire via DI.

### Layer Responsibilities

| Layer | Does | Does NOT |
|---|---|---|
| API (routes) | Request validation, schema mapping, DI wiring | Business logic, direct DB access |
| Application (services) | Orchestration, business rules, transactions | Import infrastructure, know about HTTP |
| Domain (models/enums) | Invariants, value objects, entity definitions | Import anything outside domain |
| Infrastructure (repos, clients) | IO: DB queries, HTTP calls, queues | Business decisions |

No cross-layer shortcuts. Routes never call repositories directly.

### Module Structure

Every feature module follows this layout:

```
feature/
├── api/
│   ├── router.py               # Mounts all entity routers under the module prefix
│   ├── schemas.py              # Shared request/response schemas for this module
│   └── <entity>.py             # Routes for one entity (one file per entity)
├── application/
│   ├── ports.py                # Repository interfaces (ABC) — all ports for this module
│   └── <entity>_service.py    # One service per entity/aggregate
├── domain/
│   └── models.py               # Dataclasses, enums, value objects
├── infrastructure/
│   ├── tables.py               # SQLAlchemy table definitions for this module
│   ├── repositories/
│   │   ├── <entity>.py         # One repo implementation per entity
│   │   └── <complex_entity>/   # Sub-folder when repo needs private helpers
│   │       ├── repository.py   # Main repo class
│   │       └── _helper.py      # Private SQL/mapping helpers (prefixed with _)
│   ├── shared/                 # Cross-entity infra helpers within this module
│   │   ├── sql.py              # Query building, pagination, sorting
│   │   ├── mappers.py          # Row → domain model converters
│   │   ├── keys.py             # Key/code generation logic
│   │   └── events.py           # Audit/event insertion helpers
│   └── sources/                # External data source adapters (HTTP clients, etc.)
│       └── <source>.py
└── dependencies.py             # DI wiring: repos → services → route deps
```

**Rules:**
- `api/schemas.py` — shared schemas for the module. If one entity's schemas grow large, split to `api/schemas/<entity>.py`.
- `application/ports.py` — single file with all ABC interfaces for the module. Split only if it exceeds 300 lines.
- `infrastructure/shared/` — helpers importable by any repo within the same module. Not by other modules.
- Sub-folder a repository (e.g. `backlogs/`) only when it has private helper files. Otherwise keep it as a flat `<entity>.py`.
- `infrastructure/sources/` — for external adapters (HTTP clients, SDK wrappers). Not for DB repos.

---

## Dependency Injection

- Constructor injection for services and repositories.
- Composition root: one `dependencies.py` per module wiring repos → services → route deps.
- No global singletons for services or repositories.
- No importing concrete infrastructure in Application or Domain layers.
- In FastAPI: use `Depends()` chain — `get_db` → repo factory → service factory → route parameter.

---

## Async-First

- API endpoints, DB access, and external IO are async.
- Blocking/heavy work runs in workers, not the API process.

---

## Persistence

- **Repository pattern.** Application depends on abstract interfaces (ports), infrastructure provides implementations.
- **One repository per entity/aggregate.** Never bundle multiple entities into one repo class.
- Repositories return domain models or clearly defined read models, never raw rows.
- No raw SQL in Application layer.
- Shared SQL helpers (query building, pagination, sorting) live in `infrastructure/shared/`.

---

## Error Handling

- **Single exception hierarchy.** Base `AppError` with status code, message, error code. Feature errors inherit from it.
- Standard subtypes: `NotFoundError` (404), `ValidationError` (400), `BusinessRuleError` (400), `ConflictError` (409).
- **One global exception handler** converts `AppError` → standard JSON envelope. No per-route try/catch for known errors.
- Unhandled exceptions → log full context, return generic 500. Never leak stack traces to consumers.
- All external calls have timeouts.

---

## Logging

- **Structured JSON logging** to stdout. No print statements.
- Every log entry: `timestamp`, `level`, `logger`, `message`, `event`.
- Include request context: `request_id`, `correlation_id`, `actor_id` where available.
- Use a shared `log_event()` helper for structured fields — no ad-hoc dict building.
- Log levels: `ERROR` for failures requiring attention, `WARNING` for recoverable issues, `INFO` for business events, `DEBUG` for development.

---

## Response Envelope

- All API responses wrapped in a standard envelope: `Envelope[T]` for single items, `ListEnvelope[T]` for collections.
- Error responses follow the same envelope shape: `{ "error": { "code", "message", "details" } }`.
- Pagination metadata included in list responses.

---

## Import Boundaries

- Enforce via tooling (e.g. `import-linter`).
- Application cannot import from Infrastructure.
- Domain cannot import from any other layer.
- No cross-module imports between feature modules (planning ↛ observability).
- Shared code lives in `shared/` and is importable by all modules.

### NEVER Add import-linter Exceptions

**DO NOT add, extend, or modify `ignore_imports` in import-linter configuration.** This is a hard rule with zero exceptions.

When `lint-imports` fails, it means your code violates the dependency rule. The correct response is:

1. **Fix your imports** — restructure the code so the dependency points the right way.
2. **Use the composition root correctly** — each module's `dependencies.py` wires only its OWN module's infrastructure. Never build another module's services inline.
3. **Use ports (ABCs)** — if module A needs a capability from module B, define a port in the application layer and implement it in infrastructure.
4. **Move shared code** — if multiple modules need the same adapter or helper, it belongs in the shared package.

**Explicitly forbidden:**
- Adding new lines to `ignore_imports`
- Widening existing wildcard patterns
- Importing another module's infrastructure or application layer from your composition root
- Justifying an exception with "it's just the composition root"

If you believe an exception is genuinely necessary, **STOP and ask the user**. Do not proceed.
