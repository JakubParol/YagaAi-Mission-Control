import type { EpicStatus, ItemStatus } from "@/lib/planning/types";

export interface EpicOverviewStoryPreview {
  story_id: string;
  story_key: string | null;
  title: string;
  status: ItemStatus;
  current_assignee_agent_id: string | null;
  assignee_label: string | null;
  is_blocked: boolean;
  updated_at: string | null;
}

export interface EpicOverviewItem {
  epic_key: string;
  title: string;
  status: EpicStatus;
  progress_pct: number;
  stories_total: number;
  stories_done: number;
  stories_in_progress: number;
  blocked_count: number;
  stale_days: number;
  stories_preview?: EpicOverviewStoryPreview[];
  stories_preview_total?: number | null;
}

export interface EpicOverviewListEnvelope {
  data?: EpicOverviewItem[];
  meta?: {
    total?: number;
    limit?: number;
    offset?: number;
  };
}

export interface EpicOverviewAgent {
  id: string;
  label: string;
}

export interface EpicOverviewLabel {
  name: string;
}

export type EpicOverviewSortValue =
  | "-updated_at"
  | "updated_at"
  | "priority"
  | "-priority"
  | "progress_pct"
  | "-progress_pct"
  | "blocked_count"
  | "-blocked_count";

export interface EpicOverviewFilters {
  search: string;
  status: EpicStatus | "";
  ownerId: string;
  label: string;
  blocked: "" | "true" | "false";
  sort: EpicOverviewSortValue;
}

export interface EpicOverviewStoryPreviewFilters {
  status: ItemStatus | "";
  blocked: "" | "true" | "false";
}

export interface EpicOverviewPreset {
  key: "all" | "at-risk" | "near-done";
  label: string;
  description: string;
  overrides: Partial<EpicOverviewFilters>;
}

export interface EpicOverviewStats {
  epicCount: number;
  averageProgressPct: number;
  blockedEpics: number;
  staleEpics: number;
}

export const EPIC_OVERVIEW_DEFAULT_FILTERS: EpicOverviewFilters = {
  search: "",
  status: "",
  ownerId: "",
  label: "",
  blocked: "",
  sort: "-updated_at",
};

export const EPIC_OVERVIEW_DEFAULT_STORY_PREVIEW_FILTERS: EpicOverviewStoryPreviewFilters = {
  status: "",
  blocked: "",
};

export const EPIC_OVERVIEW_SORT_OPTIONS: ReadonlyArray<{ value: EpicOverviewSortValue; label: string }> = [
  { value: "-updated_at", label: "Updated: newest" },
  { value: "updated_at", label: "Updated: oldest" },
  { value: "-priority", label: "Priority: highest" },
  { value: "priority", label: "Priority: lowest" },
  { value: "-progress_pct", label: "Progress: highest" },
  { value: "progress_pct", label: "Progress: lowest" },
  { value: "-blocked_count", label: "Blocked stories: most" },
  { value: "blocked_count", label: "Blocked stories: least" },
] as const;

export const EPIC_OVERVIEW_PRESETS: ReadonlyArray<EpicOverviewPreset> = [
  {
    key: "all",
    label: "All",
    description: "Every epic in scope",
    overrides: {
      blocked: "",
      status: "",
      sort: "-updated_at",
    },
  },
  {
    key: "at-risk",
    label: "At Risk",
    description: "Blocked epics first",
    overrides: {
      blocked: "true",
      sort: "-blocked_count",
    },
  },
  {
    key: "near-done",
    label: "Near Done",
    description: "High progress and unblocked",
    overrides: {
      blocked: "false",
      sort: "-progress_pct",
    },
  },
] as const;
