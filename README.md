# Mission Control

Management platform for AI agent workflows. Combines a web dashboard with a REST API powering three domain modules: **planning** (work management), **observability** (LLM costs), and **orchestration** (event-driven runtime).

## Repository Structure

```text
mission-control/
├── apps/
│   ├── web/                    # Next.js dashboard
│   └── cli/                    # TypeScript CLI (mc)
├── services/
│   └── api/                    # FastAPI REST API (Python)
├── infra/                      # Runtime/deployment configs (dev/prod/local-runtime)
│   └── local-runtime/          # Deterministic local Docker runtime + Dapr bootstrap
├── data/                       # Legacy local artifacts (not runtime source of truth)
└── docs/                       # Shared documentation
```

See [docs/REPO_MAP.md](./docs/REPO_MAP.md) for detailed project descriptions.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript (strict), Tailwind CSS v4, shadcn/ui |
| API | FastAPI, Python 3.12, pydantic, async |
| CLI | TypeScript, Commander.js |
| Database | PostgreSQL (Docker local/prod), SQLite compatibility paths in API |
| External | Langfuse (LLM cost tracking) |

## Getting Started (DEV, containerized local-runtime)

```bash
cd /home/kuba/repos/mission-control
./infra/local-runtime/up.sh
```

Default host ports:

- Web DEV: `3000`
- API DEV: `5000`
- Postgres DEV: `55432`

Stop runtime:

```bash
./infra/local-runtime/down.sh
```

## Deployment (PROD, full containers)

Systemd unit:

```bash
sudo cp infra/systemd/mission-control-prod.service /etc/systemd/system/mission-control-prod.service
sudo systemctl daemon-reload
sudo systemctl enable mission-control-prod.service
```

Deploy/update:

```bash
./infra/deploy.sh
```

Rollback:

```bash
./infra/rollback.sh <image-tag>
```

## Links

- [AGENTS.md](./AGENTS.md) — AI agent context and rules
- [docs/INDEX.md](./docs/INDEX.md) — Documentation index
- [docs/REPO_MAP.md](./docs/REPO_MAP.md) — Repository map
- [services/api/docs/INDEX.md](./services/api/docs/INDEX.md) — API documentation
- [infra/runbook.md](./infra/runbook.md) — DEV/PROD runtime operations
