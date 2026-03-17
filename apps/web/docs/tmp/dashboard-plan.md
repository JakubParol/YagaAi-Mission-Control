# Dashboard Refactoring Plan

## Current State
- `lib/dashboard-types.ts` — types at root level
- `components/dashboard/format-helpers.ts` — pure helpers
- `components/dashboard/costs-section.tsx` — 467 lines, has inline business logic
- `components/dashboard/dashboard.tsx` — main component, OK size
- `components/dashboard/import-controls.tsx` — OK
- `components/dashboard/requests-section.tsx` — OK size
- `components/dashboard/index.ts` — barrel export
- `app/dashboard/page.tsx` — has inline fetchJson

## Target Structure
1. Move `lib/dashboard-types.ts` → `lib/dashboard/types.ts`
2. Move `components/dashboard/format-helpers.ts` → `lib/dashboard/format-helpers.ts` (pure functions belong in lib)
3. Extract costs business logic from `costs-section.tsx` into `app/dashboard/costs-view-model.ts`
4. Update all imports

## Execution Order
1. Create `lib/dashboard/types.ts` and `lib/dashboard/index.ts`
2. Move `format-helpers.ts` to `lib/dashboard/`
3. Extract costs view model
4. Update all imports
5. Remove old files
6. Lint check
