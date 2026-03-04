---
name: mission-control-test-gate
description: Path-aware quality gate for Mission Control changes. Use after coding in /home/kuba/repos/mission-control to run the right lint/typecheck/test commands for apps/web, apps/cli, and services/api, then report evidence.
---

# Mission Control Test Gate

Run validation based on changed paths.

## 1) Detect touched modules

- Web changes: `apps/web/**`
- CLI changes: `apps/cli/**`
- API changes: `services/api/**`

## 2) Run module gates

### Web

Run:

```bash
cd apps/web
./scripts/lint.sh
```

### CLI

Run:

```bash
cd apps/cli
./scripts/lint.sh
```

### API

Run:

```bash
cd services/api
./scripts/lint.sh
poetry run pytest
```

## 3) Keep failures actionable

If any command fails:
- capture exact failing command and error,
- fix root cause,
- rerun only failed gate first,
- then rerun full relevant gate for confidence.

## 4) Evidence in final report

Always include:
- commands executed,
- pass/fail per module,
- notable warnings/deviations,
- remaining risk (if partial coverage).

If no code files changed, state `No code validation required`.
