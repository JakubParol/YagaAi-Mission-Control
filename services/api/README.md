# Mission Control API (`services/api`)

FastAPI REST service for Mission Control — planning and observability modules.

## Run locally

```bash
cd services/api
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8080
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
└── observability/           # /v1/observability — agents, costs, imports
    ├── api/
    ├── application/
    ├── domain/
    └── infrastructure/
```

## Tests

```bash
pytest
```

## Links

- [AGENTS.md](./AGENTS.md) — AI agent context and rules
- [docs/INDEX.md](./docs/INDEX.md) — API documentation
- [Root README](../../README.md)
