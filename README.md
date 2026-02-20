# Mission Control

Web-based observability dashboard for the Supervisor System. Provides real-time visibility into stories, tasks, and their lifecycle without requiring filesystem access.

> **Read-only.** This UI reads from the SUPERVISOR_SYSTEM filesystem and never modifies it.

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript (strict)
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Runtime:** Node.js 22
- **Data source:** SUPERVISOR_SYSTEM filesystem (no database)

## Getting Started

```bash
# Install dependencies
npm install

# Configure (optional — has sensible defaults)
cp .env.example .env.local
# Edit SUPERVISOR_SYSTEM_PATH if needed

# Start development server
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Configuration

| Variable | Default | Description |
|---|---|---|
| `SUPERVISOR_SYSTEM_PATH` | `/home/kuba/.openclaw/SUPERVISOR_SYSTEM` | Absolute path to the SUPERVISOR_SYSTEM directory |

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx          # Root layout
│   ├── globals.css         # Global styles (Tailwind + shadcn)
│   └── page.tsx            # Home page
└── lib/
    ├── adapters/           # Server-only filesystem read layer
    │   ├── config.ts       # Path configuration
    │   ├── stories.ts      # Story reader
    │   ├── tasks.ts        # Task reader (YAML parsing)
    │   ├── results.ts      # Result artifacts reader
    │   └── index.ts        # Public API barrel
    ├── types.ts            # Core domain types
    └── utils.ts            # shadcn utility (cn)
```

## Architecture

The app follows a **read adapter** pattern:

- **Adapters** (`src/lib/adapters/`) are server-only modules that read the SUPERVISOR_SYSTEM filesystem. They parse YAML task files and markdown story files into typed domain objects.
- **Types** (`src/lib/types.ts`) define the domain model: `Story`, `Task`, `TaskState`, `TaskResult`, `ResultFile`.
- **Pages** use Next.js Server Components to call adapters directly. No API routes needed for reads.
- UI components never import `fs` or adapters directly — they receive data as props.

## Links

- [AGENTS.md](./AGENTS.md) — AI agent context and rules
- [docs/INDEX.md](./docs/INDEX.md) — Documentation index
- [GitHub](https://github.com/YagaAi/YagaAi-Mission-Control)
