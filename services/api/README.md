# Mission Control API (`services/api`)

FastAPI REST service for Mission Control — planning, observability, and orchestration modules.

## Run locally

```bash
cd services/api
poetry install

# Optional local override (recommended)
cp .env.example .env.local
# set MC_API_DATABASE_URL=postgresql+psycopg://mission_control:mission_control_dev@127.0.0.1:5432/mission_control

poetry run alembic upgrade head

poetry run uvicorn app.main:app --reload --port 5000
```

Health endpoint: `GET /healthz`

## Structure

```
app/
├── main.py                  # FastAPI app factory
├── config.py                # pydantic-settings (MC_API_* env vars)
├── shared/                  # Cross-module: health, envelope, errors, deps
│   └── api/
│       └── health.py
├── planning/                # /v1/planning — work management
│   ├── api/                 # Routers + schemas
│   ├── application/         # Services + ports (ABCs)
│   ├── domain/              # Models, enums, invariants
│   └── infrastructure/      # Repository implementations
├── observability/           # /v1/observability — LLM costs, requests, Langfuse import
│   ├── api/
│   ├── application/
│   ├── domain/
│   └── infrastructure/
└── orchestration/           # /v1/orchestration — command ingestion + outbox
    ├── api/
    ├── application/
    ├── domain/
    └── infrastructure/
```

## Tests

```bash
poetry run pytest
```

## Linting

```bash
./scripts/lint.sh          # Check mode
./scripts/lint.sh --fix    # Auto-fix formatting
```

## Links

- [AGENTS.md](./AGENTS.md) — AI agent context and rules
- [docs/INDEX.md](./docs/INDEX.md) — API documentation
- [Root README](../../README.md)
