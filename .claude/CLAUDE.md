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

## Planning Database

When the user asks you to work with planning entities (projects, epics, stories, tasks, backlogs, agents, labels, etc.) — creating, updating, querying, or reviewing them:

1. **DB location**: Read `MC_DB_PATH` from `/home/kuba/mission-control/mission-control.env`
2. **First time in session**: Before any DB operations, read the schema at `apps/web/src/lib/planning/schema.ts` and types at `apps/web/src/lib/planning/types.ts` to understand the current table structure, constraints, and enums
3. **Direct SQL**: Use `sqlite3` CLI to run queries directly against the database. Examples:
   - `sqlite3 <db_path> "SELECT * FROM projects;"`
   - `sqlite3 <db_path> ".mode column" ".headers on" "SELECT ..."`
4. **Write operations**: For INSERT/UPDATE/DELETE, always show the SQL to the user and confirm before executing
5. **Key generation**: When creating epics/stories/tasks within a project, use the `project_counters` table to allocate the next key (e.g. `MC-42`). Read `apps/web/src/lib/planning/repository.ts` to understand the `allocateKey`/`buildKey` logic before doing this manually
6. **UUIDs**: Generate UUIDs for new entity `id` fields using `uuidgen` or `sqlite3` `lower(hex(randomblob(4)))||'-'||...` pattern
