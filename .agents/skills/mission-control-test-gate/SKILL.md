---
name: mission-control-test-gate
description: Path-aware quality gate for Mission Control changes. Use after coding to run deterministic lint/typecheck/test commands for apps/web, apps/cli, and services/api, then return evidence.
---

# Mission Control Test Gate (v2)

Run validation based on changed paths.

## 1) Detect touched modules

Map changed files to modules:
- Web: `apps/web/**`
- CLI: `apps/cli/**`
- API: `services/api/**`

## 2) Run module gates

### Web

```bash
cd apps/web
./scripts/lint.sh --fix
./scripts/lint.sh
```

### CLI

```bash
cd apps/cli
./scripts/lint.sh --fix
./scripts/lint.sh
```

### API

```bash
cd services/api
./scripts/lint.sh --fix
./scripts/lint.sh
poetry run pytest
```

## 3) Failure handling (mandatory)

If any gate fails:
1. capture failing command + exact error,
2. fix root cause,
3. rerun failed gate,
4. rerun full relevant module gate for confidence.

Do not report DONE if gates are still failing.

## Zero-warnings policy and quality standard

- Apply strict zero-warnings quality bar: resolve warnings at source, not by suppression.
- Do not use `# noqa`, blanket disables, lint-ignore comments, or config weakening to hide issues unless user explicitly approves an exception.
- Keep fixes senior-level: preserve intent, improve clarity, avoid hacky workarounds.

## 4) Evidence format

Return:
- commands executed,
- pass/fail per module,
- key failure fixes (if any),
- residual risk (if partial).

If no code files changed, return: `No code validation required`.
