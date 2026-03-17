You are running a fully autonomous code quality and architecture enforcement session on `services/api/`. The user is asleep — do NOT ask for confirmation, approval, or input at any point. Make all decisions yourself. If you encounter a problem you would normally ask about, make the best decision and move on.

## Git Setup

1. You MUST be on `main`. Run `git pull` to get latest.
2. Create a new branch: `git checkout -b refactor/api-quality-sweep`
3. All work happens on this branch. Commit frequently.

## Required Reading (read ALL before doing anything)

Read these in order — they define what "correct" looks like:

1. `AGENTS.md` — repo-level rules
2. `docs/standards/coding-standards.md` — workspace quality gate, file size limits, general rules
3. `docs/standards/coding-standards-backend.md` — **your bible** — clean architecture, layers, module structure, DI, ports & adapters, error handling, persistence, import boundaries
4. `services/api/AGENTS.md` — API-specific rules and tech decisions
5. `services/api/docs/ARCHITECTURE.md` — current module layout and wiring
6. `services/api/docs/INDEX.md` — pointers to further API docs

Then read ALL source files in `services/api/app/` and `services/api/tests/` to understand current state.

## What to Check

Scan the entire `services/api/` codebase and fix any deviation from the coding standards. This includes but is not limited to:

### Clean Architecture
- Dependency rule: Infrastructure → Application → Domain, never reverse
- Routers never import repositories — always through application services
- Application owns ports (ABCs/Protocols), infrastructure implements them
- Domain has zero external dependencies — pure models, enums, invariants
- No cross-module imports (planning ↛ observability ↛ orchestration), shared code in `shared/`

### File Size & Structure
- Hard limit: 300 lines per file — split by entity or concern when exceeded
- One repository class per file, one service class per file
- Module structure matches the canonical layout from `coding-standards-backend.md`
- Schemas split into `api/schemas/<entity>.py` subfolder when file grows large
- God-interface ports split into focused Protocol classes per entity
- Repositories sub-foldered only when they have private helper files

### Dependency Injection & Wiring
- Constructor injection for services and repositories
- One `dependencies.py` per module wiring repos → services → route deps
- No global singletons, no importing concrete infrastructure in Application/Domain
- `Depends()` chain: `get_db` → repo factory → service factory → route parameter

### Separation of Concerns
- API layer: request validation, schema mapping, DI wiring — no business logic, no direct DB
- Application layer: orchestration, business rules, transactions — no HTTP knowledge, no infrastructure imports
- Domain layer: invariants, value objects, entity definitions — imports nothing outside domain
- Infrastructure layer: IO (DB queries, HTTP calls) — no business decisions

### Testability & Test Hygiene
- Tests updated to match current signatures and imports
- Port/adapter pattern enables test doubles via DI — no monkey-patching
- Test files live next to the module they test (in `tests/<module>/`)

### Code Quality
- Type hints everywhere, strict typing
- Explicit DTOs for request/response — no leaking internal types
- Small modules named by intent, not `utils`/`helpers`
- DRY with judgment — extract when 3+ consumers, not before
- No magic config — explicit pydantic `BaseSettings`

### Error Handling
- Single `AppError` hierarchy with standard subtypes
- Global exception handler converts `AppError` → JSON envelope
- No per-route try/catch for known errors, no swallowed exceptions
- All external calls have timeouts

## Critical Rules

- **Zero warnings policy.** Every warning is a bug. Fix at the source like a senior engineer. Understand the root cause, fix it properly.
- **No suppression hacks.** NEVER use `# noqa`, `# type: ignore`, `# pylint: disable`, `@ts-ignore`, blanket lint config weakening, or any other mechanism to hide issues.
- **Before EVERY commit**, run:
  ```bash
  cd /home/kuba/repos/mission-control/services/api
  ./scripts/lint.sh --fix
  ./scripts/lint.sh
Both must pass with zero warnings, zero errors.

Run tests after completing each module: poetry run pytest tests/ -x -q
Update test files if your changes affect imports or signatures that tests reference.
Workflow
For each issue found:

Read all relevant files before changing anything
Fix at source — proper refactor, not a workaround
Update all imports (within module AND in tests)
Run lint and tests
Commit with descriptive message
Move to next issue
Commit Convention

refactor(api): <what changed>
End every commit message with:


Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
When Done
Verify full lint passes: ./scripts/lint.sh
Verify all tests pass: poetry run pytest tests/ -x -q
Verify no file in services/api/app/ exceeds 300 lines
Push the branch: git push -u origin refactor/api-quality-sweep
Create a PR with gh pr create summarizing all changes
If nothing needed fixing — do not create empty commits or PRs. Just stop.
BEGIN WORK NOW.