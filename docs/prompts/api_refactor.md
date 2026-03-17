You are running a fully autonomous, long-running refactoring session. The user is asleep — do NOT ask for confirmation, approval, or input at any point. Make all decisions yourself. If you encounter a problem you would normally ask about, make the best decision and move on.

## Git Setup

1. You MUST be on `main`. Run `git pull` to get latest.
2. Create a new branch: `git checkout -b refactor/web-clean-architecture-refactor`
3. All work happens on this branch. Commit frequently (at minimum after each feature/layer).

## Critical Rules

- **NEVER run tests.** Tests are broken and will hang indefinitely. Do NOT run `npm test`, `node --test`, or any test command.
- **Before EVERY commit**, run the lint script. Due to PATH issues in this environment, run the tools directly:
  ```bash
  cd /home/kuba/repos/mission-control/apps/web
  npx eslint --fix
  npx eslint        # must pass with zero warnings
  npx tsc --noEmit  # must pass with zero errors
Zero warnings policy. Every warning is a bug. Fix at source. No eslint-disable, no @ts-ignore, no suppression hacks.
No test execution, but DO update test files if your refactor changes imports or signatures that test files reference.
Required Reading (read these BEFORE starting any work)
docs/standards/coding-standards.md — quality gate, general rules
docs/standards/coding-standards-frontend.md — full frontend architecture spec (this is your bible)
docs/INDEX.md → docs/REPO_MAP.md — understand repo structure
AGENTS.md — agent workflow rules
Read ALL existing files in apps/web/src/ to understand current state before changing anything
Reference: Already-completed backend refactor
PR #147 refactored services/api/ following the same pattern. Look at its commits for the style and approach:

Split monolithic files into focused modules, check for best pattenrs and practices
Moved files into proper directory structure
Updated all imports and wiring
Fixed all lint warnings
What to Refactor
Full refactor of apps/web/ to match docs/standards/coding-standards-frontend.md. The target architecture is:

Layer	Location	Responsibility
Pages	app/<feature>/page.tsx	Layout, data orchestration, route params — NO business logic
View models	app/<feature>/*-view-model.ts	Transform/filter/sort data for the view — pure functions, no React
Actions	app/<feature>/*-actions.ts	Server-side mutations, API calls
Feature components	components/<feature>/	UI + user interaction for one domain
Shared UI	components/ui/	Pure presentation, zero business logic
Hooks	hooks/	Reusable stateful logic
Lib	lib/<feature>/	Types, adapters, API calls, pure functions
Key rules from the standards:

No cross-feature imports (planning never imports from dashboard)
Pages are thin (<300 lines) — extract to view models, actions, sub-components
View models are pure functions (no React, no side effects)
Shared UI components are pure (no app logic, no auth, no routing, no data fetching)
Props are explicit interfaces named <Component>Props
Config objects at module level, not inside render
cn() for class merging, never manual string concatenation
Domain types in lib/<feature>/types.ts
Server Components by default, "use client" only when needed and as low as possible
Work Order
Go feature by feature: dashboard → planning → shared/lib. Within each feature, go layer by layer.

For each layer in each feature:

Create a plan in apps/web/docs/tmp/<feature>-<layer>-plan.md
Read all relevant files
Execute the plan
Run lint (npx eslint --fix && npx eslint && npx tsc --noEmit)
Commit with descriptive message
Move to next layer
Feature: Dashboard
app/dashboard/ — pages
components/dashboard/ — feature components
lib/dashboard-types.ts — types
Feature: Planning
app/planning/ — pages, view models, actions, filters
components/planning/ — feature components (large — ~30 files)
lib/planning/ — types, adapters, settings
Shared
components/ui/ — shared UI primitives
components/ (root level) — app shell, sidebar, etc.
hooks/ — shared hooks
lib/ — api client, utils, errors, navigation, types
Commit Convention

refactor(web): <what changed>
Example: refactor(web): extract dashboard page into view model and feature components

End every commit message with:


Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
When Done
Verify full lint passes one final time
Push the branch: git push -u origin refactor/web-clean-architecture
Create a PR with gh pr create summarizing all changes
Working Directory
You can create apps/web/docs/tmp/ for plans and notes.

BEGIN WORK NOW.