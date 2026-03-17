You are running a fully autonomous code quality and architecture enforcement session on `apps/web/`. The user is asleep — do NOT ask for confirmation, approval, or input at any point. Make all decisions yourself. If you encounter a problem you would normally ask about, make the best decision and move on.

## Git Setup

1. You MUST be on `main`. Run `git pull` to get latest.
2. Create a new branch: `git checkout -b refactor/web-quality-sweep-{UUID}`
3. All work happens on this branch. Commit frequently.

## Required Reading (read ALL before doing anything)

Read these in order — they define what "correct" looks like:

1. `AGENTS.md` — repo-level rules
2. `docs/standards/coding-standards.md` — workspace quality gate, file size limits, general rules
3. `docs/standards/coding-standards-frontend.md` — **your bible** — architecture, layers, component rules, data fetching, state management, styling, type safety, forms, error handling, testing, file organization
4. `apps/web/AGENTS.md` — web project rules and tech decisions
5. `docs/REPO_MAP.md` — understand repo structure

Then read ALL source files in `apps/web/src/` to understand current state.

## What to Check

Scan the entire `apps/web/src/` codebase and fix any deviation from the coding standards. This includes but is not limited to:

### Architecture & Separation of Concerns

| Layer | Location | Does | Does NOT |
|---|---|---|---|
| Pages | `app/<feature>/page.tsx` | Layout, data orchestration, route params | Business logic, direct API calls inline |
| View models | `app/<feature>/*-view-model.ts` | Transform/filter/sort data for the view | Fetch data, manage state |
| Actions | `app/<feature>/*-actions.ts` | Server-side mutations, API calls | UI state, rendering |
| Feature components | `components/<feature>/` | UI + user interaction for one domain | Import from other features |
| Shared UI | `components/ui/` | Pure presentation, zero business logic | Auth checks, routing, data fetching |
| Hooks | `hooks/` | Reusable stateful logic (polling, events) | Feature-specific business rules |
| Lib | `lib/<feature>/` | Types, adapters, API calls, pure functions | React imports, component logic |

- No cross-feature imports — planning never imports from dashboard, and vice versa
- Shared code lives in `components/ui/`, `hooks/`, or `lib/`

### File Size & Structure
- Hard limit: 300 lines per file — split by concern when exceeded
- Pages are thin — extract logic to view models, actions, sub-components
- View models are pure functions — no React, no side effects, easy to test
- Actions are async functions — one file per concern, handle API calls and error mapping

### Component Rules
- Shared UI components are pure — no app logic, no auth, no routing, no data fetching. Props in, JSX out
- One component per file (small internal render helpers OK)
- Props are explicit interfaces named `<Component>Props`, never inline anonymous types
- Config objects (style maps, status configs, layout constants) at module level, not inside render
- Composition over configuration — prefer slots/children over complex config props

### Server vs Client Components
- Default to Server Components
- `"use client"` only when the component needs interactivity (state, effects, event handlers)
- Keep `"use client"` boundary as low as possible — wrap only the interactive part, not the whole page

### Data Fetching
- API calls live in `lib/` or `*-actions.ts`, never inline in components
- Use `apiUrl()` helper from `lib/api-client.ts` for URL construction
- Always handle errors: check `response.ok`, parse error envelopes, surface field-level validation
- Polling via `useAutoRefresh` hook — no raw `setInterval`

### State Management
- Local state first — `useState` for UI, `useReducer` for complex multi-field
- Context for cross-page shared state, one provider per concern
- URL search params for filters that should survive refresh/share
- Discriminated unions for page state (`loading | error | ok`)
- No Redux, Zustand, or global stores unless complexity demands it

### Type Safety
- Strict TypeScript — no `any`, no `as` casts unless truly unavoidable (and commented why)
- Domain types in `lib/<feature>/types.ts`, shared across components, pages, and actions
- API response types match backend envelope: `{ data: T }` for items, `{ data: T[], meta: { total } }` for lists
- Enums as union types, not TypeScript `enum`

### Styling
- Tailwind CSS v4, utility-first
- `cn()` helper for conditional class merging — never manual string concatenation
- CVA for variant-driven components
- shadcn/ui for base primitives — customize via Tailwind, don't fork

### Error Handling
- `AppError` class in `lib/errors/` for typed error handling
- API handler wrapper for consistent error extraction
- User-facing errors via inline messages or `ErrorCard` — no raw `alert()`
- Never swallow errors silently

### Testability & Test Hygiene
- Node.js built-in test runner (`node:test` + `node:assert/strict`)
- Test: view models, adapters, mappers, filter/sort logic, action functions, pure utilities
- Do NOT test: UI rendering, CSS classes, layout
- Test files live next to source: `foo.ts` → `foo.test.ts`
- Update test files if refactor changes imports or signatures

## Critical Rules

- **Zero warnings policy.** Every warning is a bug. Fix at the source like a senior engineer. Understand the root cause, fix it properly.
- **No suppression hacks.** NEVER use `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, blanket lint config weakening, or any other mechanism to hide issues.
- **Before EVERY commit**, run:
  ```bash
  cd /home/kuba/repos/mission-control/apps/web
  ./scripts/lint.sh --fix
  ./scripts/lint.sh
  ```
  Both must pass with zero warnings, zero errors.
- **Run tests** after completing each feature: `cd /home/kuba/repos/mission-control/apps/web && npx node --test --experimental-strip-types 'src/**/*.test.ts' 'src/**/*.test.tsx'`
- If tests hang for more than 60 seconds, kill and skip — but still update test files for import/signature changes.

## Workflow

For each issue found:
1. Read all relevant files before changing anything
2. Fix at source — proper refactor, not a workaround
3. Update all imports and test files
4. Run lint and tests
5. Commit with descriptive message
6. Move to next issue

## Commit Convention

```
refactor(web): <what changed>
```

End every commit message with:
```
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

## When Done

1. Verify full lint passes: `./scripts/lint.sh`
2. Verify no file in `apps/web/src/` exceeds 300 lines
3. Push the branch: `git push -u origin refactor/web-quality-sweep`
4. Create a PR with `gh pr create` summarizing all changes
5. If nothing needed fixing — do not create empty commits or PRs. Just stop.

## Working Directory

You can create `apps/web/docs/tmp/` for plans and notes.

BEGIN WORK NOW.
