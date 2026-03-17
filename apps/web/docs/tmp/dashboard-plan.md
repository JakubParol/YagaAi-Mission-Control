# Dashboard Refactor Plan (Phase 2)

## Remaining Issues
1. `costs-view-model.ts` contains `fetchCostMetrics()` — API call in a pure view model
2. `costs-section.tsx` (333 lines) — over 300-line limit, inline fetch calls
3. `dashboard.tsx` — inline fetch in handleImportComplete
4. `import-controls.tsx` — inline fetch for import trigger
5. `requests-section.tsx` — inline fetch for models list

## Actions
1. Create `app/dashboard/dashboard-actions.ts` with all API call functions
2. Remove `fetchCostMetrics` from costs-view-model.ts (side effect in pure module)
3. Refactor costs-section.tsx to use actions, get under 300 lines
4. Refactor import-controls.tsx, requests-section.tsx, dashboard.tsx to use actions
