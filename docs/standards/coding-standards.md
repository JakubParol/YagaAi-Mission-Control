# Coding Standards

These standards apply to all projects unless a project-specific doc overrides them.

## Required Reading by Stack

Before working on any layer, read this entire file **and** the stack-specific standard:

- **Backend (Python / FastAPI):** [coding-standards-backend.md](./coding-standards-backend.md) — MANDATORY before any backend change
- **Backend Testing:** [testing-standards-backend.md](./testing-standards-backend.md) — MANDATORY before writing or modifying backend tests
- **Frontend (Next.js / React):** [coding-standards-frontend.md](./coding-standards-frontend.md) — MANDATORY before any frontend change

---

## Quality Gate (MANDATORY — read first)

Applies to **code projects** (`apps/web`, `apps/cli`, `services/api`). Does not apply to root-level docs, infra scripts, or config-only changes.

Before every commit that touches a code project, run from that project's root:

```bash
./scripts/lint.sh --fix   # auto-fix what it can
./scripts/lint.sh          # verify zero warnings, zero errors
./scripts/test.sh          # run tests — all must pass
```

- **Zero-warnings policy.** Every warning is a bug. Fix at source.
- **No suppression hacks.** Do not use `# noqa`, `# type: ignore`, `eslint-disable`, `@ts-ignore`, blanket lint config weakening, or any other mechanism to hide issues.
- **Fix like a senior.** Understand the root cause, fix it properly. No workarounds, no duct tape.
- **If `scripts/lint.sh` does not exist** in a code project you're modifying — **STOP and report BLOCKER.** Do not proceed without a quality gate.

---

## Git Workflow

- Every task gets its own branch off `main`. Pull first to get latest main. No direct commits to `main`.
- Commit early, commit often, meaningful messages.
- PR-based merge flow when CI/PR rules exist.

---

## File Size & Splitting

- **Hard limit: 300 lines per file.** If approaching this, split by entity or concern.
- One repository class per file. One service class per file.
- Group related files in subdirectories when a folder grows past ~8 files.
- Never bundle multiple entity repositories into a single file.

---

## Code Quality

- **Type hints everywhere.** Strict linting.
- **Explicit DTOs** for request/response models. No leaking internal types to API boundaries.
- **Small modules, named by intent** (`create_order`, `validate_payment`, not `utils`, `helpers`).
- **DRY with judgment.** Extract when 3+ consumers need it, not before.
- No magic config — explicit settings objects (e.g. pydantic `BaseSettings`).

---

## Testing

- **Unit tests** (domain + application): majority of tests. No DB, no external services. Mock via DI ports.
- **Integration tests** (infrastructure): real DB, real adapters.
- **Contract tests**: API request/response shape validation.
- Use DI + ports to inject test doubles. No monkey-patching, no test-only hacks.
