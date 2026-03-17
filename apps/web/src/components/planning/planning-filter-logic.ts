import type { WorkItemStatus } from "@/lib/planning/types";

export const PLANNING_FILTER_KEYS = {
  search: "q",
  status: "status",
  type: "type",
  labelId: "label",
  epicId: "epic",
  assignee: "assignee",
} as const;

export const UNASSIGNED_FILTER_VALUE = "unassigned";

export interface PlanningFiltersValue {
  search: string;
  status: WorkItemStatus | "";
  type: string;
  labelId: string;
  epicId: string;
  assignee: string;
}

export interface PlanningFilterOption {
  value: string;
  label: string;
}

export interface PlanningStoryFilterItem {
  id?: string;
  key: string | null;
  title: string;
  status: WorkItemStatus;
  story_type: string;
  labels?: readonly { id: string; name?: string | null }[];
  epic_id?: string | null;
  epic_key?: string | null;
  epic_title?: string | null;
  current_assignee_agent_id?: string | null;
  assignee_agent_id?: string | null;
}

export interface PlanningFilterCandidate {
  key: string | null;
  title: string;
  status: WorkItemStatus;
  type: string;
  labelIds: readonly string[];
  epicId: string | null;
  assigneeId: string | null;
}

function normalizeLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function normalizeAssigneeId(item: PlanningStoryFilterItem): string | null {
  return item.current_assignee_agent_id ?? item.assignee_agent_id ?? null;
}

function matchesPlanningFilterCandidate(
  item: PlanningFilterCandidate,
  filters: PlanningFiltersValue,
): boolean {
  const normalizedSearch = filters.search.trim().toLowerCase();

  if (normalizedSearch.length > 0) {
    const key = (item.key ?? "").toLowerCase();
    const title = item.title.toLowerCase();
    if (!key.includes(normalizedSearch) && !title.includes(normalizedSearch)) {
      return false;
    }
  }

  if (filters.status.length > 0 && item.status !== filters.status) {
    return false;
  }

  if (filters.type.length > 0 && item.type !== filters.type) {
    return false;
  }

  if (filters.labelId.length > 0 && !item.labelIds.includes(filters.labelId)) {
    return false;
  }

  if (filters.epicId.length > 0 && item.epicId !== filters.epicId) {
    return false;
  }

  if (filters.assignee.length > 0) {
    if (filters.assignee === UNASSIGNED_FILTER_VALUE) {
      if (item.assigneeId !== null) {
        return false;
      }
    } else if (item.assigneeId !== filters.assignee) {
      return false;
    }
  }

  return true;
}

export function applyPlanningFilters<T>(
  items: readonly T[],
  filters: PlanningFiltersValue,
  selectCandidate: (item: T) => PlanningFilterCandidate,
): T[] {
  return items.filter((item) => matchesPlanningFilterCandidate(selectCandidate(item), filters));
}

export function hasActivePlanningFilters(value: PlanningFiltersValue): boolean {
  return (
    value.search.trim().length > 0
    || value.status.length > 0
    || value.type.length > 0
    || value.labelId.length > 0
    || value.epicId.length > 0
    || value.assignee.length > 0
  );
}

export function applyPlanningStoryFilters<T extends PlanningStoryFilterItem>(
  stories: readonly T[],
  filters: PlanningFiltersValue,
): T[] {
  return applyPlanningFilters(stories, filters, (story) => ({
    key: story.key,
    title: story.title,
    status: story.status,
    type: story.story_type,
    labelIds: (story.labels ?? []).map((label) => label.id),
    epicId: story.epic_id ?? null,
    assigneeId: normalizeAssigneeId(story),
  }));
}

export function buildStoryStatusOptions(
  stories: readonly Pick<PlanningStoryFilterItem, "status">[],
): PlanningFilterOption[] {
  return [...new Set(stories.map((story) => story.status))]
    .sort((a, b) => a.localeCompare(b))
    .map((status) => ({ value: status, label: normalizeLabel(status) }));
}

export function buildStoryTypeOptions(
  stories: readonly Pick<PlanningStoryFilterItem, "story_type">[],
): PlanningFilterOption[] {
  return [...new Set(stories.map((story) => story.story_type))]
    .sort((a, b) => a.localeCompare(b))
    .map((type) => ({ value: type, label: normalizeLabel(type) }));
}

export function buildStoryLabelOptions(
  stories: readonly Pick<PlanningStoryFilterItem, "labels">[],
): PlanningFilterOption[] {
  const labelsById = new Map<string, string>();
  for (const story of stories) {
    for (const label of story.labels ?? []) {
      if (!labelsById.has(label.id)) {
        labelsById.set(label.id, label.name ?? label.id);
      }
    }
  }

  return [...labelsById.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function buildStoryEpicOptions(
  stories: readonly Pick<PlanningStoryFilterItem, "epic_id" | "epic_key" | "epic_title">[],
): PlanningFilterOption[] {
  const epicsById = new Map<string, string>();

  for (const story of stories) {
    if (!story.epic_id) {
      continue;
    }

    const key = story.epic_key?.trim();
    const title = story.epic_title?.trim();
    if (key && title) {
      epicsById.set(story.epic_id, `${key} ${title}`);
      continue;
    }

    if (key) {
      epicsById.set(story.epic_id, key);
      continue;
    }

    if (title) {
      epicsById.set(story.epic_id, title);
      continue;
    }

    epicsById.set(story.epic_id, story.epic_id);
  }

  return [...epicsById.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
