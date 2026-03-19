@AGENTS.md

## Startup Instructions

On session start, you MUST follow the full drill-down from AGENTS.md:

1. Read AGENTS.md (auto-loaded above)
2. Read ALL mandatory references listed in "Required Reading":
   - `docs/standards/coding-standards.md`
   - `docs/standards/documentation.md`
   - `docs/INDEX.md`
3. From docs/INDEX.md, read the mandatory doc: `docs/REPO_MAP.md`
4. Report what you read before proceeding

When the user tells you what they're working on, drill into that project:
- Read the project's AGENTS.md and its mandatory refs
- Read the project's docs/INDEX.md
- Choose what else to read based on the task
- Report what you additionally read

## End To End Implementation Flow (E2E)

If your ptompt contains the marker '[E2E], you are running full work-item implementation flow.
The flow is described in .agents/skills/mission-control-delivery-flow/SKILL.md
Follow that floww strictly.

## Autonomous Mode

If your prompt contains the marker `[AUTONOMOUS_STEP]`, you are running as a one-shot executor inside an automated pipeline. In this mode:
- **IGNORE "Task Workflow"** — the pipeline manages the workflow
- **IGNORE "Planning Operations"** — do NOT call `mc` CLI
- **IGNORE "Startup Instructions"** — do NOT report what you read
- Focus ONLY on the specific task described in your prompt
- Read project docs for context (drill-down is still useful), but do NOT execute any workflow steps beyond what your prompt asks
