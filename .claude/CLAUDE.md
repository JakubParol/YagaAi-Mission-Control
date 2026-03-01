@AGENTS.md

## Startup Instructions

On session start, you MUST follow the full drill-down from AGENTS.md:

1. Read AGENTS.md (auto-loaded above)
2. Read ALL mandatory references listed in "Required Reading":
   - `/home/kuba/.openclaw/standards/coding-standards.md`
   - `/home/kuba/.openclaw/standards/documentation.md`
   - `docs/INDEX.md`
3. From docs/INDEX.md, read the mandatory doc: `docs/REPO_MAP.md`
4. Report what you read before proceeding

When the user tells you what they're working on, drill into that project:
- Read the project's AGENTS.md and its mandatory refs
- Read the project's docs/INDEX.md
- Choose what else to read based on the task
- Report what you additionally read

## Planning Operations

When the user asks you to work with planning entities (projects, epics, stories, tasks, backlogs, agents, labels, etc.) — creating, updating, querying, or reviewing them:

1. **Use `mc` CLI only.** Do NOT use direct SQL queries or raw API calls. The CLI handles key generation, UUIDs, validation, and all business logic. The `mc` command is deployed and available in PATH.
2. **Discover commands with `--help`.** Use `mc --help`, `mc story --help`, `mc story create --help`, etc. to learn available commands, options, and required fields.
4. **Use `--output json`** when you need to parse responses programmatically. Default is table output for human reading.
5. **Common patterns:**
   - List: `mc story list --project-key MC --sort priority`
   - Get: `mc story get --key MC-47 --output json`
   - Create: `mc story create --json '{"title":"...","story_type":"USER_STORY","project_id":"..."}'`
   - Update: `mc task update --id <uuid> --set status=IN_PROGRESS`
   - Filter: `--key`, `--project-id`, `--story-id`, `--status`, `--sort`

## Task Workflow

When asked to plan and implement a User Story:

1. **Plan** — Prepare the implementation plan for the US.
2. **Create tasks** — Use `mc task create` to create tasks in the US based on the plan.
3. **Start the story** — Before starting the first task, set the story to IN_PROGRESS via `mc story update`.
4. **For each task:**
   - Set the task to IN_PROGRESS via `mc task update --id <uuid> --set status=IN_PROGRESS`
   - Implement and commit
   - Set the task to DONE via `mc task update --id <uuid> --set status=DONE`
5. **Finish** — After all tasks are DONE, set the story to CODE_REVIEW via `mc story update`.
