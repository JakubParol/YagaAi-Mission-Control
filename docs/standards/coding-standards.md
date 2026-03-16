# Coding Standards

These standards apply to all projects unless a project-specific doc overrides them.

---

## Git Workflow (Hard Rule)

Every task gets its own branch. No exceptions.

1. **Start:** `git checkout main && git pull origin main`
2. **Branch:** `git checkout -b <task-id>` (e.g. `task-001-scaffold-and-foundation`)
3. **Work:** commit early, commit often, meaningful messages
4. **Push:** `git push origin <branch-name>`
5. **Never commit directly to main.** All work goes through branches.

If the repo has CI/PR rules, open a PR. If not, push the branch and let the Supervisor decide on merge.

---

## Architecture

- **Clean Architecture, package by feature.** Group by domain concept, not by technical layer.
- **Dependency rule:** dependencies point inward only. Infrastructure → Application, never the reverse.
- **Port/Adapter pattern:** Application defines interfaces (ports). Infrastructure implements them. Wire via DI.
- **Separation of concerns:**
  - Routes/API: validation and mapping only
  - Services/Use Cases: orchestration, transactions, policies
  - Domain: invariants and core behavior
  - Infrastructure: IO only (DB, HTTP, queues, LLM calls)
- No cross-layer shortcuts. Routes never call repositories directly.

## Dependency Injection

- Constructor injection preferred.
- No global singletons for services.
- No importing concrete infrastructure in Application/Domain.
- Composition root lives in startup wiring.

## Async-First

- API endpoints are async.
- Database access uses async drivers.
- External IO is async.
- Blocking/heavy work runs in workers, not the API process.

## Code Quality

- **DRY with judgment.** Extract shared logic into services. Don't create "generic" abstractions until 3+ consumers need it.
- **Type hints everywhere.** Strict linting.
- **Explicit DTOs** for inbound/outbound models. No leaking internal types to API boundaries.
- **Small modules, named by intent** (`create_order`, `validate_payment`, not `utils`, `helpers`).
- No magic config — prefer explicit settings objects.

## Persistence

- Repository pattern. Application depends on interfaces, infrastructure provides implementations.
- Repositories return domain entities or clearly defined read models.
- No raw SQL in Application layer.

## Error Handling

- Base `AppError` class with status code + message. Feature errors inherit from it.
- Single generic exception handler converts `AppError` to standard response shape.
- No internal traces leaked to API consumers.
- All external calls have timeouts.
- Idempotency where feasible (dedup by natural key + time window).

## Testing

- **Unit tests** (domain + application): majority of tests. Must run without DB/Redis/external services.
- **Integration tests** (infrastructure): DB, queue, and adapter tests.
- **Contract tests**: API request/response shape validation.
- Use DI + ports to mock external dependencies. No test-only hacks.

## Frontend (when applicable)

- Business logic, routing, i18n live in the app layer.
- Shared UI components are pure: no app logic, no auth checks, no routing.
- Composition over configuration — prefer slots/children over complex config props.
- Shared components accept strings as props. Translation happens in the consumer.
- No cross-app imports.
