import type {
  EpicOverviewFilters,
  EpicOverviewItem,
  EpicOverviewStats,
  EpicOverviewStoryPreview,
  EpicOverviewStoryPreviewFilters,
} from "./overview-types";

const EPIC_OVERVIEW_STORY_PREVIEW_LIMIT = 3;

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function matchesSearch(item: EpicOverviewItem, query: string): boolean {
  if (query.length === 0) return true;
  return item.work_item_key.toLowerCase().includes(query) || item.title.toLowerCase().includes(query);
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

function matchesStoryStatus(
  story: EpicOverviewStoryPreview,
  status: EpicOverviewStoryPreviewFilters["status"],
): boolean {
  return status.length === 0 || story.status === status;
}

function matchesStoryBlocked(
  story: EpicOverviewStoryPreview,
  blocked: EpicOverviewStoryPreviewFilters["blocked"],
): boolean {
  if (blocked === "true") return story.is_blocked;
  if (blocked === "false") return !story.is_blocked;
  return true;
}

export function buildEpicOverviewStats(items: readonly EpicOverviewItem[]): EpicOverviewStats {
  if (items.length === 0) {
    return {
      epicCount: 0,
      averageProgressPct: 0,
      blockedEpics: 0,
      blockedStories: 0,
      averageTrend7dPct: 0,
      maxStaleDays: 0,
      staleEpics: 0,
    };
  }

  const totalProgress = items.reduce((acc, item) => acc + normalizePercent(item.progress_pct), 0);
  const totalTrend7d = items.reduce((acc, item) => acc + normalizePercent(item.progress_trend_7d), 0);
  const blockedEpics = items.filter((item) => item.blocked_count > 0).length;
  const blockedStories = items.reduce((acc, item) => acc + Math.max(0, item.blocked_count), 0);
  const maxStaleDays = items.reduce((max, item) => Math.max(max, Math.max(0, item.stale_days)), 0);
  const staleEpics = items.filter((item) => item.stale_days >= 7).length;

  return {
    epicCount: items.length,
    averageProgressPct: Math.round((totalProgress / items.length) * 10) / 10,
    blockedEpics,
    blockedStories,
    averageTrend7dPct: Math.round((totalTrend7d / items.length) * 10) / 10,
    maxStaleDays,
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

export function applyStoryPreviewFilters(
  stories: readonly EpicOverviewStoryPreview[],
  filters: EpicOverviewStoryPreviewFilters,
): EpicOverviewStoryPreview[] {
  return stories.filter((story) => {
    if (!matchesStoryStatus(story, filters.status)) return false;
    if (!matchesStoryBlocked(story, filters.blocked)) return false;
    return true;
  });
}

export function toPercentLabel(value: number): string {
  const normalized = normalizePercent(value);
  return `${Math.round(normalized)}%`;
}

export function toStoriesLabel(item: EpicOverviewItem): string {
  return `${item.children_done}/${item.children_total} done · ${item.children_in_progress} in progress`;
}

export function getEpicOverviewStoriesPreview(
  item: EpicOverviewItem,
  options?: { limit?: number },
): EpicOverviewStoryPreview[] {
  const limit = Math.max(1, options?.limit ?? EPIC_OVERVIEW_STORY_PREVIEW_LIMIT);
  const preview = item.stories_preview ?? [];
  return preview.slice(0, limit);
}

export function getEpicOverviewStoriesPreviewOverflow(
  item: EpicOverviewItem,
  options?: { limit?: number },
): number {
  const limit = Math.max(1, options?.limit ?? EPIC_OVERVIEW_STORY_PREVIEW_LIMIT);
  const previewCount = item.stories_preview?.length ?? 0;
  const total = Math.max(previewCount, item.stories_preview_total ?? 0);
  return Math.max(0, total - limit);
}

export function toStoryPreviewTitle(story: EpicOverviewStoryPreview): string {
  return story.work_item_key ? `${story.work_item_key} ${story.title}` : story.title;
}

export function toStoryPreviewAssignee(story: EpicOverviewStoryPreview): string {
  if (story.assignee_label && story.assignee_label.trim().length > 0) {
    return story.assignee_label;
  }
  return "Unassigned";
}

export function toStoryPreviewUpdatedAt(story: EpicOverviewStoryPreview): string {
  if (!story.updated_at) return "n/a";
  const value = new Date(story.updated_at);
  if (Number.isNaN(value.getTime())) return story.updated_at;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(value);
}
