# Repository Map — Mission Control

Overview of all projects and components in this monorepo.

---

## Projects

| Project | Path | Type | Description |
|---|---|---|---|
| **Web** | `apps/web/` | Next.js 15 | Dashboard UI — planning + orchestration observability |
| **CLI** | `apps/cli/` | TypeScript | Command-line interface (`mc`) over API contracts |
| **API** | `services/api/` | FastAPI (Python) | REST API — planning, observability, orchestration |

---

## Web (`apps/web/`)

The Next.js application serving the Mission Control dashboard.

| Item | Detail |
|---|---|
| Entry point | `apps/web/src/app/` (App Router) |
| Domain types | `apps/web/src/lib/types.ts` |
| Planning schema/client | `apps/web/src/lib/planning/` |
| API routes | `apps/web/src/app/api/` |
| Config | `apps/web/.env.local` (`NEXT_PUBLIC_API_URL`, `API_URL`) |
| AGENTS.md | [`apps/web/AGENTS.md`](../apps/web/AGENTS.md) |

---

## CLI (`apps/cli/`)

TypeScript CLI (`mc`) built with Commander.js. Mirrors API resources as command groups.

| Item | Detail |
|---|---|
| Entry point | `apps/cli/src/index.ts` |
| Binary | `mc` (via `dist/index.js`) |
| Config | `MC_API_BASE_URL`, `MC_ACTOR_ID`, `MC_ACTOR_TYPE`, `MC_OUTPUT`, `MC_TIMEOUT_SECONDS` |
| Lint | `apps/cli/scripts/lint.sh` |
| AGENTS.md | [`apps/cli/AGENTS.md`](../apps/cli/AGENTS.md) |
| Docs | [`apps/cli/docs/INDEX.md`](../apps/cli/docs/INDEX.md) |

---

## API (`services/api/`)

FastAPI REST service with three domain modules:

| Module | Prefix | Domain |
|---|---|---|
| **planning** | `/v1/planning` | Projects, epics, stories, tasks, backlogs, assignments, labels |
| **observability** | `/v1/observability` | LLM costs, requests, Langfuse import |
| **orchestration** | `/v1/orchestration` | Command intake, timeline read model, watchdog, runtime metrics |

| Item | Detail |
|---|---|
| Entry point | `services/api/app/main.py` |
| Architecture | Package-by-feature, clean-ish layered boundaries per module |
| Config | `services/api/app/config.py` (`MC_API_*`) |
| AGENTS.md | [`services/api/AGENTS.md`](../services/api/AGENTS.md) |
| Docs | [`services/api/docs/INDEX.md`](../services/api/docs/INDEX.md) |

---

## Runtime / Infra

| Path | Purpose |
|---|---|
| `infra/dev/docker-compose.dev.yml` | DEV dependencies/runtime split (host API/Web + dockerized postgres/redis/worker+dapr) |
| `infra/prod/docker-compose.prod.yml` | Full PROD container stack |
| `infra/systemd/mission-control-prod.service` | Systemd unit for PROD docker-compose stack |
| `infra/local-runtime/` | Deterministic local Docker runtime (api/web/worker/redis/postgres + Dapr sidecars) |
| `infra/runbook.md` | Operator runbook for DEV/PROD workflows |
| `infra/deploy.sh`, `infra/rollback.sh` | Deployment and rollback scripts |

---

## Persistence

| Environment | Persistence |
|---|---|
| Local runtime / DEV / PROD | PostgreSQL |
| API compatibility layer | SQLite migration utilities kept in code for backward compatibility paths |

---

## External Dependencies

| System | Purpose | How accessed |
|---|---|---|
| Langfuse | LLM observability (costs, traces) | HTTP API ingestion |

---

## Navigation

- ↑ [Docs Index](./INDEX.md)
- ↑ [README.md](../README.md)
- ↑ [AGENTS.md](../AGENTS.md)
