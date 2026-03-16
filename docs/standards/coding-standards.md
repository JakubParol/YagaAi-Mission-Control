# Coding Standards

These standards apply to all projects unless a project-specific doc overrides them.

---

## Quality Gate (MANDATORY — read first)

Before every commit, run from the project root:

```bash
./scripts/lint.sh --fix   # auto-fix what it can
./scripts/lint.sh          # verify zero warnings, zero errors
```

- **Zero-warnings policy.** Every warning is a bug. Fix at source.
- **No suppression hacks.** Do not use `# noqa`, `# type: ignore`, `eslint-disable`, `@ts-ignore`, blanket lint config weakening, or any other mechanism to hide issues.
- **Fix like a senior.** Understand the root cause, fix it properly. No workarounds, no duct tape.
- **If `scripts/lint.sh` does not exist** in the project you're working on — **STOP and report BLOCKER.** Do not proceed without a quality gate.

---

## Git Workflow

- Every task gets its own branch off `main`. Pull first to get latest main. No direct commits to `main`.
- Commit early, commit often, meaningful messages.
- PR-based merge flow when CI/PR rules exist.

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

## File Size & Splitting

- **Hard limit: 300 lines per file.** If approaching this, split by entity or concern.
- One repository class per file. One service class per file.
- Group related files in subdirectories when a folder grows past ~8 files.
- Never bundle multiple entity repositories into a single file.

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

## Code Quality

- **Type hints everywhere.** Strict linting.
- **Explicit DTOs** for request/response models. No leaking internal types to API boundaries.
- **Small modules, named by intent** (`create_order`, `validate_payment`, not `utils`, `helpers`).
- **DRY with judgment.** Extract when 3+ consumers need it, not before.
- No magic config — explicit settings objects (e.g. pydantic `BaseSettings`).

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

---

## Testing

- **Unit tests** (domain + application): majority of tests. No DB, no external services. Mock via DI ports.
- **Integration tests** (infrastructure): real DB, real adapters.
- **Contract tests**: API request/response shape validation.
- Use DI + ports to inject test doubles. No monkey-patching, no test-only hacks.

---

## Frontend (when applicable)

- Business logic, routing, i18n live in the app layer.
- Shared UI components are pure: no app logic, no auth checks, no routing.
- Composition over configuration — prefer slots/children over complex config props.
- Shared components accept strings as props. Translation happens in the consumer.
- No cross-app imports.
