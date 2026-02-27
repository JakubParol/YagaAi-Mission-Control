# Mission Control API (services/api)

Python FastAPI backend scaffold for Mission Control.

## Run locally

```bash
cd services/api
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8080
```

Health endpoint:
- `GET /healthz`

## Structure

- `app/main.py` — FastAPI app entrypoint
- `app/config.py` — environment settings
- `app/api/health.py` — health router
- `tests/` — scaffolded tests
- `docs/INDEX.md` — API docs index
