# Skills-Driven UI Polish — Experiment Results

**Branch:** `experiment-skills-ui-polish`
**Date:** 2026-02-20
**Files changed:** 20 (+629, -391)

---

## What the Skills Flagged

### frontend-design (anti-AI-slop)

| Issue | Location | Fix |
|---|---|---|
| Gratuitous `animate-pulse` on connection indicator | `connection-status.tsx` | Removed — static dot is sufficient |
| Excessive `shadow-lg shadow-[#ec8522]/5` on hover | Multiple card components | Replaced with subtle `bg-white/[0.02]` shifts |
| Overly rounded `rounded-xl` everywhere | Board cards, task cards | Tightened to `rounded-lg` for intentional look |
| Emoji icons (📊, 📋, ✅) in empty states | `empty-state.tsx` | Replaced with proper Lucide icons |
| Too-heavy `font-semibold` on nav items | `sidebar.tsx` | Reduced to `font-medium` |

### next-best-practices

| Issue | Location | Fix |
|---|---|---|
| No `display: "swap"` on fonts | `layout.tsx` | Added for faster initial paint |
| Font CSS variables mismatched theme | `layout.tsx` | Changed to `--font-sans` / `--font-mono` to match `@theme inline` |
| No metadata on child pages | `stories/[id]`, `tasks/[storyId]/[taskId]` | Added `generateMetadata` with title |
| No `title.template` | `layout.tsx` | Added `"%s | Mission Control"` template |
| Sequential task fetching on board | `board/page.tsx` | Parallelized with `Promise.all` |
| Duplicate `.dark` CSS block | `globals.css` | Removed — identical to `:root` |

### vercel-react-best-practices (performance)

| Issue | Location | Fix |
|---|---|---|
| Board re-computes grouping on every render | `kanban-board.tsx` | Wrapped in `useMemo` |
| O(n) `indexOf` for story color lookup | `kanban-board.tsx` | Replaced with O(1) `Map` |
| `useAutoRefresh` duplicates initial server data | `use-auto-refresh.ts` | Skips first fetch, starts polling after interval |
| `fetchData` recreated on every render | `use-auto-refresh.ts` | Stable ref with `useRef` for URL |
| Polling wastes resources on hidden tabs | `use-auto-refresh.ts`, `connection-status.tsx` | Added `visibilitychange` listener |
| No error backoff — hammers server | `use-auto-refresh.ts` | Exponential backoff (2^n, capped at 8x) |
| `setInterval` can pile up on slow responses | `use-auto-refresh.ts` | Switched to `setTimeout` chain |

### web-design-guidelines (accessibility)

| Issue | Location | Fix |
|---|---|---|
| No keyboard focus indicators | Global | Added `.focus-ring` utility, applied to all interactive elements |
| Missing ARIA on connection status | `connection-status.tsx` | Added `role="status"`, `aria-live="polite"` |
| No ARIA on kanban board | `kanban-board.tsx` | Added `role="region"`, `aria-label`, section elements |
| No `aria-label` on task card links | `kanban-board.tsx` | Added descriptive labels |
| Decorative icons not hidden from SR | Multiple | Added `aria-hidden="true"` |
| Vague "Live/Error" labels | `connection-status.tsx` | Changed to "Connected/Disconnected" |
| Story cards lack SR context | `story-list.tsx` | Added `sr-only` labels |

### vercel-composition-patterns

| Issue | Location | Fix |
|---|---|---|
| `.join(' ')` for class concatenation | All 15 component files | Migrated to `cn()` utility |
| Hardcoded hex colors (`#ec8522`, `#e2e8f0`, etc.) | Pages and components | Replaced with semantic tokens (`text-primary`, `text-foreground`, etc.) |

---

## Summary

The 6 skills collectively identified **25+ concrete issues** across accessibility, performance, design quality, and code patterns. All were fixed. The most impactful changes:

1. **Accessibility**: The app now has proper keyboard navigation with visible focus rings, ARIA landmarks, live regions, and screen reader labels. It went from essentially zero keyboard/SR support to solid baseline coverage.

2. **Performance**: The polling hook was completely overhauled — no more wasted initial fetches, visibility-aware polling, exponential backoff, and stable references. The board page fetches tasks in parallel instead of sequentially.

3. **Design quality**: Removed "AI slop" patterns (gratuitous animations, emoji icons, over-shadowed hover states). The result is more restrained and intentional — it looks designed rather than generated.

4. **Code quality**: Consistent use of `cn()` and semantic color tokens makes the codebase more maintainable and theme-aware.

**Build status:** ✅ `npm run build` passes with zero errors.
