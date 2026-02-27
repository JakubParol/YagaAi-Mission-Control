# Mission Control

Management platform for AI agent workflows. Combines a web dashboard with a REST API powering two domain modules: **planning** (work management) and **observability** (LLM costs).

## Repository Structure

```
mission-control/
├── apps/
│   ├── web/                    # Next.js dashboard
│   └── cli/                    # CLI (planned)
├── services/
│   └── api/                    # FastAPI REST API (Python)
├── infra/                      # Deployment configs (systemd, scripts)
├── data/                       # SQLite database (gitignored)
└── docs/                       # Shared documentation
```

See [docs/REPO_MAP.md](./docs/REPO_MAP.md) for detailed project descriptions.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript (strict), Tailwind CSS v4, shadcn/ui |
| API | FastAPI, Python 3.12, pydantic, async |
| CLI | Planned |
| Database | SQLite (shared `data/mission-control.db`) |
| External | Langfuse (LLM cost tracking) |

## Getting Started

### Frontend (Next.js)

```bash
cd apps/web
npm install

# Configure
cp .env.example .env.local
# Edit LANGFUSE_* vars as needed

npm run dev
```

Runs at [http://localhost:3000](http://localhost:3000).

### API (FastAPI)

```bash
cd services/api
poetry install
poetry run uvicorn app.main:app --reload --port 8080
```

See [services/api/README.md](./services/api/README.md) for details.

## Deployment

### Build frontend for production

```bash
cd apps/web
npm run build
npm start -- -p 3100
```

### Systemd service

```bash
sudo cp infra/mission-control.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable mission-control
sudo systemctl start mission-control
```

Runs on port **3100**, restarts on failure.

## Links

- [AGENTS.md](./AGENTS.md) — AI agent context and rules
- [docs/INDEX.md](./docs/INDEX.md) — Documentation index
- [docs/REPO_MAP.md](./docs/REPO_MAP.md) — Repository map
- [services/api/docs/INDEX.md](./services/api/docs/INDEX.md) — API documentation
