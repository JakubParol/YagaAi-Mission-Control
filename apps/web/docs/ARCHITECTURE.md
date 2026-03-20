# Architecture — Mission Control Web

## Overview

Next.js 16 (App Router) dashboard for the Mission Control platform. Dark-mode-first operator UI providing three modules: **Dashboard** (observability), **Planning** (work item management), and **Control Plane** (agent timeline).

All data comes from the FastAPI backend (`services/api/`). The frontend has no direct database access.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS v4, `tailwind-merge`, `class-variance-authority` |
| Components | shadcn/ui (Radix primitives), Lucide icons |
| Fonts | Inter (sans), Geist Mono (mono) |

---

## Directory Structure

```
apps/web/
├── src/
│   ├── app/                    # Next.js App Router (pages + layouts)
│   │   ├── layout.tsx          # Root layout (dark mode, fonts, AppShell)
│   │   ├── page.tsx            # Root redirect
│   │   ├── dashboard/          # Observability module
│   │   ├── planning/           # Planning module
│   │   │   ├── backlog/        # Backlog view
│   │   │   ├── board/          # Sprint board view
│   │   │   ├── epics-overview/ # Epics summary
│   │   │   ├── list/           # Flat list view
│   │   │   ├── settings/       # Project settings
│   │   │   └── work-items/[id] # Work item detail
│   │   └── control-plane/      # Control Plane module
│   │       └── timeline/       # Agent timeline
│   ├── components/
│   │   ├── ui/                 # shadcn/ui primitives
│   │   ├── planning/           # Planning-specific components
│   │   ├── dashboard/          # Dashboard-specific components
│   │   ├── app-shell.tsx       # Sidebar + content layout
│   │   ├── sidebar.tsx         # Collapsible navigation sidebar
│   │   └── page-shell.tsx      # Shared page wrapper
│   └── lib/
│       ├── types.ts            # Core domain types (TaskState, etc.)
│       ├── api-client.ts       # API base URL helper
│       ├── navigation.ts       # Module + sub-page navigation config
│       ├── planning/           # Planning domain types and utilities
│       └── dashboard/          # Dashboard types and format helpers
├── scripts/
│   ├── lint.sh                 # ESLint quality gate
│   ├── run-dev.sh              # Dev server launcher
│   └── kill-dev-port.sh        # Port cleanup utility
└── next.config.ts              # API proxy rewrites, standalone output
```

---

## Modules and Routes

| Module | Route prefix | Description |
|---|---|---|
| Dashboard | `/dashboard` | LLM cost and request observability |
| Planning | `/planning` | Work items: board, backlog, list, epics, settings, detail |
| Control Plane | `/control-plane` | Agent orchestration timeline |

Navigation is defined declaratively in `src/lib/navigation.ts` — sidebar and mobile nav render from this config.

---

## Data Flow

```
Browser  →  Next.js (SSR/RSC)  →  /api/* rewrite  →  FastAPI backend
```

- **Server-side:** `API_URL` env var (defaults to `http://127.0.0.1:5000`)
- **Client-side:** `NEXT_PUBLIC_API_URL` env var (defaults to `/api`)
- Next.js `rewrites` in `next.config.ts` proxies `/api/*` to the FastAPI backend, so the browser never sees internal hostnames

All pages use `force-dynamic` to ensure fresh data from the API on every request.

---

## Environment Variables

| Variable | Side | Default | Purpose |
|---|---|---|---|
| `API_URL` | Server | `http://127.0.0.1:5000` | FastAPI backend URL for SSR |
| `NEXT_PUBLIC_API_URL` | Client | `/api` | API base for browser requests |
| `NEXT_DIST_DIR` | Build | `.next` | Build output directory |
| `NEXT_ALLOWED_DEV_ORIGINS` | Dev | `localhost,127.0.0.1,100.106.117.41` | CORS origins for dev |

---

## Key Conventions

- **Dark mode default:** `<html className="dark">` with localStorage toggle (`mc.theme`)
- **Types are the contract:** UI components depend on types from `src/lib/types.ts` and `src/lib/planning/types.ts`, not raw API shapes
- **Component organization:** Domain components live in `components/{module}/`, shared primitives in `components/ui/`
- **Standalone output:** `next.config.ts` sets `output: "standalone"` for containerized deployment

---

## Navigation

- [INDEX.md](./INDEX.md)
- [AGENTS.md](../AGENTS.md)
- [README.md](../README.md)
