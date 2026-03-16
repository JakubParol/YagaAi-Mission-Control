# Full API Refactor Plan — Clean Architecture

## What's Already Done (PR #146)
- Planning infrastructure: migrated to SQLAlchemy Core, removed raw SQL, eliminated SqlTextSession for planning repos

## What Needs to Change

### Planning Module
**Domain**: OK — clean dataclasses and enums, no external deps. No changes needed.
**Application**: OK — ports.py, services follow pattern. No changes needed.
**API**: OK — router.py mounts entity routers, schemas.py exists. No changes needed.
**Infrastructure**: Already refactored in PR #146. No changes needed.
**Dependencies**: OK — follows Depends() chain pattern. No changes needed.

### Orchestration Module
**Domain**: OK — models.py + stream_contract.py, clean dataclasses/enums.
**Application**: OK — ports.py, services follow pattern.
**Infrastructure**: NEEDS REFACTOR
  - sqlite_repository.py is 1002 lines (violates 300-line limit)
  - Uses raw SQL via SqlTextSession (needs SQLAlchemy Core like planning)
  - Everything in one file (violates one-repo-per-entity)
  - No repositories/ subfolder
  - No shared/ subfolder
**API**: Minor — router.py has mapper functions that should stay (they're thin). schemas.py OK.
  - router.py is 258 lines — OK
  - dapr_router.py is 179 lines — OK
**Dependencies**: Uses SqlTextSession wrapper — needs to pass AsyncSession directly after infra refactor.

### Observability Module
**Domain**: OK — clean dataclasses.
**Application**: OK — ports.py, services follow pattern.
**Infrastructure**: NEEDS REFACTOR
  - langfuse_repository.py uses raw SQL via SqlTextSession (needs SQLAlchemy Core)
  - langfuse_client.py should move to sources/ subfolder
  - langfuse_repository.py should move to repositories/ subfolder
  - No repositories/ or sources/ subfolder structure
**API**: NEEDS REFACTOR
  - router.py has everything in one file, no schemas.py
  - Returns raw dicts instead of typed response schemas
  - Missing Envelope/ListEnvelope wrapping
**Dependencies**: Uses SqlTextSession — needs update after infra refactor.

## Execution Order
1. Orchestration infrastructure (biggest, most impactful)
2. Orchestration dependencies
3. Observability infrastructure
4. Observability API (add schemas, envelope wrapping)
5. Observability dependencies
