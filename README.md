# Mission Control

Management platform for AI agent workflows. Combines a web dashboard with a REST API powering three domain modules: **planning** (work management), **observability** (LLM costs), and **orchestration** (event-driven runtime).

## Repository Structure

```text
mission-control/
|-- apps/
|   |-- web/                    # Next.js dashboard
|   `-- cli/                    # TypeScript CLI (mc)
|-- services/
|   `-- api/                    # FastAPI REST API (Python)
|-- infra/                      # Runtime/deployment configs (dev/prod)
|   `-- dev/                    # Deterministic DEV Docker runtime + Dapr bootstrap
|-- data/                       # Local artifacts not used as runtime source of truth
`-- docs/                       # Shared documentation
```

See [docs/REPO_MAP.md](./docs/REPO_MAP.md) for detailed project descriptions.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript (strict), Tailwind CSS v4, shadcn/ui |
| API | FastAPI, Python 3.12, pydantic, async |
| CLI | TypeScript, Commander.js |
| Database | PostgreSQL (Docker local/dev/prod) |
| External | Langfuse (LLM cost tracking) |

## Getting Started (DEV, containerized runtime)

Fresh Ubuntu VM bootstrap (run from repo root):

```bash
bash ./install.sh
```

This installs Docker + Node.js when missing, builds the global `mc` CLI wrapper,
creates DEV/PROD env files, installs systemd units, and brings up both stacks.

After install, bare `mc` targets the PROD API on `http://127.0.0.1:5100` by default.
Use `--api-base http://127.0.0.1:5000` when you want to hit DEV explicitly.

Manual DEV runtime:

```bash
./infra/dev/up.sh
```

Default host ports:

- Web DEV: `3000`
- API DEV: `5000`
- Postgres DEV: `55432`

Stop runtime:

```bash
./infra/dev/down.sh
```

## Deployment (PROD, full containers)

Preferred on fresh Ubuntu hosts: `bash ./install.sh`

Systemd unit:

```bash
sudo cp infra/systemd/mission-control-prod.service /etc/systemd/system/mission-control-prod.service
sudo systemctl daemon-reload
sudo systemctl enable mission-control-prod.service
```

The checked-in unit file contains hardcoded paths. If you install manually instead of using `install.sh`, adjust repo paths in the unit file before enabling it.

Deploy/update:

```bash
./infra/deploy.sh
```

`infra/deploy.sh` runs API PostgreSQL migrations before recreating the production stack.

Rollback:

```bash
./infra/rollback.sh <image-tag>
```

## Links

- [AGENTS.md](./AGENTS.md) - AI agent context and rules
- [docs/INDEX.md](./docs/INDEX.md) - Documentation index
- [docs/REPO_MAP.md](./docs/REPO_MAP.md) - Repository map
- [services/api/docs/INDEX.md](./services/api/docs/INDEX.md) - API documentation
- [infra/runbook.md](./infra/runbook.md) - DEV/PROD runtime operations
