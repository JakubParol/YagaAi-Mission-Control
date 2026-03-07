import type { EpicOverviewFilters, EpicOverviewItem, EpicOverviewStats } from "./overview-types";

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function matchesSearch(item: EpicOverviewItem, query: string): boolean {
  if (query.length === 0) return true;
  return item.epic_key.toLowerCase().includes(query) || item.title.toLowerCase().includes(query);
}

function matchesStatus(item: EpicOverviewItem, status: EpicOverviewFilters["status"]): boolean {
  return status.length === 0 || item.status === status;
}

function matchesBlocked(item: EpicOverviewItem, blocked: EpicOverviewFilters["blocked"]): boolean {
  if (blocked === "true") return item.blocked_count > 0;
  if (blocked === "false") return item.blocked_count === 0;
  return true;
}

function matchesNearDonePreset(item: EpicOverviewItem): boolean {
  return item.progress_pct >= 70 && item.blocked_count === 0;
}

export function buildEpicOverviewStats(items: readonly EpicOverviewItem[]): EpicOverviewStats {
  if (items.length === 0) {
    return {
      epicCount: 0,
      averageProgressPct: 0,
      blockedEpics: 0,
      staleEpics: 0,
    };
  }

  const totalProgress = items.reduce((acc, item) => acc + normalizePercent(item.progress_pct), 0);
  const blockedEpics = items.filter((item) => item.blocked_count > 0).length;
  const staleEpics = items.filter((item) => item.stale_days >= 7).length;

  return {
    epicCount: items.length,
    averageProgressPct: Math.round((totalProgress / items.length) * 10) / 10,
    blockedEpics,
    staleEpics,
  };
}

export function applyClientEpicOverviewFilters(
  items: readonly EpicOverviewItem[],
  filters: EpicOverviewFilters,
  presetKey: "all" | "at-risk" | "near-done",
): EpicOverviewItem[] {
  const search = normalizeSearch(filters.search);

  return items.filter((item) => {
    if (!matchesSearch(item, search)) return false;
    if (!matchesStatus(item, filters.status)) return false;
    if (!matchesBlocked(item, filters.blocked)) return false;
    if (presetKey === "near-done" && !matchesNearDonePreset(item)) return false;
    return true;
  });
}

export function toPercentLabel(value: number): string {
  const normalized = normalizePercent(value);
  return `${Math.round(normalized)}%`;
}

export function toStoriesLabel(item: EpicOverviewItem): string {
  return `${item.stories_done}/${item.stories_total} done · ${item.stories_in_progress} in progress`;
}
