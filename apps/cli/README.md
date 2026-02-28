# Mission Control CLI

Command-line interface for Mission Control. Provides CRUD operations on planning entities (projects, epics, stories, tasks) via the Mission Control API.

## Setup

```bash
cd apps/cli
npm install
npm run build
```

## Usage

```bash
# Use the built CLI
node dist/index.js <command> [options]

# Or link globally
npm link
mc <command> [options]
```

### Global Options

| Option | Description | Default |
|--------|-------------|---------|
| `--api-url <url>` | API base URL | `http://localhost:5001` (or `MC_API_URL` env) |
| `--json` | Output raw JSON instead of tables | `false` |
| `--help` | Show help | |
| `--version` | Show version | |

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MC_API_URL` | Base URL for the Mission Control API | `http://localhost:5001` |

## Commands

### Projects

```bash
mc projects list [--limit N] [--offset N] [--status ACTIVE|ARCHIVED]
mc projects get <id>
mc projects create --key MC --name "Mission Control" [--description "..."] [--repo-root /path]
mc projects update <id> [--name "..."] [--description "..."] [--status ACTIVE|ARCHIVED]
mc projects delete <id>
```

### Epics

```bash
mc epics list --project-id <id> [--status TODO|IN_PROGRESS|DONE] [--limit N]
mc epics get <id> --project-id <id>
mc epics create --project-id <id> --title "..." [--description "..."] [--priority N]
mc epics update <id> --project-id <id> [--title "..."] [--status "..."]
mc epics delete <id> --project-id <id>
```

### Stories

```bash
mc stories list [--project-id <id>] [--epic-id <id>] [--status "..."] [--story-type feature|bug|chore|spike]
mc stories get <id>
mc stories create --title "..." --story-type feature [--project-id <id>] [--epic-id <id>]
mc stories update <id> [--title "..."] [--status "..."] [--epic-id <id>]
mc stories delete <id>
mc stories labels add <story-id> <label-id>
mc stories labels remove <story-id> <label-id>
```

### Tasks

```bash
mc tasks list [--project-id <id>] [--story-id <id>] [--status "..."] [--assignee <agent-id>]
mc tasks get <id>
mc tasks create --title "..." --task-type coding [--project-id <id>] [--story-id <id>]
mc tasks update <id> [--title "..."] [--status "..."] [--priority N] [--is-blocked true|false]
mc tasks delete <id>
mc tasks assign <task-id> <agent-id> [--reason "..."]
mc tasks unassign <task-id>
mc tasks labels add <task-id> <label-id>
mc tasks labels remove <task-id> <label-id>
```

## Development

```bash
npm run dev -- projects list     # Run via ts-node
npm run build                     # Compile TypeScript
npm run lint                      # Run ESLint
npm run lint:fix                  # Auto-fix lint issues
```

## Links

- [AGENTS.md](./AGENTS.md)
- [Root README](../../README.md)
- [API Contracts](../../services/api/docs/API_CONTRACTS.md)
