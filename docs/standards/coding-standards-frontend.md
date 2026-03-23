# Coding Standards — Frontend

Extends [coding-standards.md](./coding-standards.md). Everything in the parent applies here.

---

## Architecture

- **Package by feature.** Feature components in `components/<feature>/`, pages in `app/<feature>/`.
- **Separation of concerns:**

| Layer | Location | Does | Does NOT |
|---|---|---|---|
| Pages | `app/<feature>/page.tsx` | Layout, data orchestration, route params | Business logic, direct API calls inline |
| View models | `app/<feature>/*-view-model.ts` | Transform/filter/sort data for the view | Fetch data, manage state |
| Feature components | `components/<feature>/` | UI + user interaction for one domain | Import from other features |
| Shared UI | `components/ui/` | Pure presentation, zero business logic | Auth checks, routing, data fetching |
| Hooks | `hooks/` | Reusable stateful logic (polling, events) | Feature-specific business rules |
| Lib | `lib/<feature>/` | Types, adapters, API calls, pure functions | React imports, component logic |
| Actions | `app/<feature>/*-actions.ts` | Server-side mutations, API calls | UI state, rendering |

- No cross-feature imports. Planning components never import from dashboard.
- Shared code lives in `components/ui/`, `hooks/`, or `lib/`.

---

## Component Rules

- **Shared UI components are pure.** No app logic, no auth, no routing, no data fetching. Props in, JSX out.
- **Composition over configuration.** Prefer slots/children over complex config props.
- **Shared components accept strings as props.** Translation/formatting happens in the consumer, not the component.
- **One component per file.** Small internal sub-components (render helpers) are OK within the same file if private.
- **Props are explicit interfaces.** Named `<Component>Props`, never inline anonymous types.
- **Config objects at module level.** Style maps, status configs, layout constants — top of file, not inside render.

### Server vs Client Components

- Default to **Server Components**. Add `"use client"` only when the component needs interactivity (state, effects, event handlers).
- Keep `"use client"` boundary as low as possible — wrap only the interactive part, not the whole page.
- Server-only utilities import `"server-only"` to prevent accidental client bundling.

---

## Data Fetching

- **API calls live in `lib/` or `*-actions.ts`**, never inline in components.
- Use `apiUrl()` helper from `lib/api-client.ts` for URL construction — handles server vs client base URL.
- Always handle errors: check `response.ok`, parse error envelopes, surface field-level validation.
- Use `AbortController` for cleanup in effects.
- **Polling:** use `useAutoRefresh` hook with visibility detection. No raw `setInterval`.

---

## State Management

- **Local state first.** `useState` for UI concerns, `useReducer` for complex multi-field state.
- **Context for cross-page shared state** (e.g. project selection). One provider per concern, not a global store.
- **URL search params for filters.** Filters that should survive refresh/share go in query string.
- **Discriminated unions for page state.** Model loading/error/empty/success as explicit variants:
  ```typescript
  type PageState =
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ok"; data: T };
  ```
- No Redux, Zustand, or global stores unless complexity demands it.

---

## Styling

- **Tailwind CSS v4.** Utility-first, no custom CSS unless Tailwind can't express it.
- **Styles live in components, not in global CSS.** `globals.css` is only for CSS variables, resets, and Tailwind base. All visual styling happens via Tailwind classes inside component files.
- **`cn()` helper** (`lib/utils.ts`) for conditional class merging — always use it, never manual string concatenation.
- **CVA (class-variance-authority)** for variant-driven components (buttons, badges, cards).
- **shadcn/ui** for base primitives (dialog, popover, command, select). Customize via Tailwind, don't fork.
- **`ThemedSelect` for all dropdowns.** Never use native `<select>` — it renders with browser-default styling that breaks the dark theme. Use `ThemedSelect` from `components/ui/themed-select.tsx` for every dropdown. Pass options as `{ value, label }[]` and customize appearance via `triggerClassName`/`contentClassName`.
- **Dark mode is the default.** All color choices must work on dark backgrounds.

---

## Type Safety

- **Strict TypeScript.** No `any`, no `as` casts unless truly unavoidable (and commented why).
- **Domain types in `lib/<feature>/types.ts`.** Shared across components, pages, and actions.
- **API response types match the backend envelope.** `{ data: T }` for items, `{ data: T[], meta: { total } }` for lists.
- **Props interfaces exported** from the component file. Consumers import the type, not guess.
- **Enums as union types** (`type Status = "TODO" | "IN_PROGRESS" | "DONE"`), not TypeScript `enum`.

---

## Forms

- **Field-level error state.** Every form tracks `fieldErrors: Record<string, string>` alongside `formError: string | null`.
- **Clear errors on change.** When user edits a field, clear that field's error immediately.
- **Map API validation errors to fields.** Parse 422 responses into field-level messages.
- **Submission via actions.** Form `onSubmit` calls an action function, not inline fetch.

---

## Error Handling

- **`AppError` class** in `lib/errors/` for typed error handling.
- **API handler wrapper** for consistent error extraction from responses.
- **User-facing errors** shown via inline messages or `ErrorCard` component. No raw `alert()`.
- **Never swallow errors silently.** Catch → log → show feedback or re-throw.

---

## Testing

- **Node.js built-in test runner** (`node:test` + `node:assert/strict`). No Jest or Vitest.
- **What to test:**
  - View models and data transformations (`*-view-model.test.ts`)
  - Adapters and mappers (`*-adapter.test.ts`)
  - Filter/sort logic (`*-filters.test.ts`)
  - Action functions with mocked fetch (`*-actions.test.ts`)
  - Pure utility functions
- **What NOT to unit test:** UI rendering, CSS classes, layout. Those belong in E2E or visual regression.
- **Test files live next to source.** `foo.ts` → `foo.test.ts` in the same directory.

---

## File Organization

- **Pages are thin.** Orchestrate state and compose feature components. Extract logic to view models and actions.
- **View models are pure functions.** Take raw data, return view-ready data. No React, no side effects. Easy to test.
- **Actions are async functions.** One file per concern (`story-actions.ts`, `board-actions.ts`). Handle API calls and error mapping.
- When a page grows past 300 lines, extract view model, actions, or sub-components into sibling files.
