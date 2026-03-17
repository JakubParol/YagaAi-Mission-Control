import type { WorkItemStatus } from "@/lib/planning/types";
import {
  applyPlanningStoryFilters,
  buildStoryEpicOptions,
  buildStoryLabelOptions,
  buildStoryStatusOptions,
  buildStoryTypeOptions,
  PLANNING_FILTER_KEYS,
  UNASSIGNED_FILTER_VALUE,
  type PlanningFilterOption,
  type PlanningFiltersValue,
} from "@/components/planning/planning-filters";

import type { StoryCardStory } from "@/components/planning/story-card";

import type { BoardState } from "./board-page-actions";
import type { QuickCreateAssigneeOption } from "./quick-create";

/* ------------------------------------------------------------------ */
/*  URL filter helpers (pure)                                          */
/* ------------------------------------------------------------------ */

export function readFiltersFromSearchParams(
  searchParams: URLSearchParams,
): PlanningFiltersValue {
  return {
    search: searchParams.get(PLANNING_FILTER_KEYS.search) ?? "",
    status: (searchParams.get(PLANNING_FILTER_KEYS.status) ?? "") as WorkItemStatus | "",
    type: searchParams.get(PLANNING_FILTER_KEYS.type) ?? "",
    labelId: searchParams.get(PLANNING_FILTER_KEYS.labelId) ?? "",
    epicId: searchParams.get(PLANNING_FILTER_KEYS.epicId) ?? "",
    assignee: searchParams.get(PLANNING_FILTER_KEYS.assignee) ?? "",
  };
}

export function buildFilterUrl(
  pathname: string,
  searchParams: URLSearchParams,
  key: keyof PlanningFiltersValue,
  value: string,
): string {
  const params = new URLSearchParams(searchParams.toString());
  const paramKey = PLANNING_FILTER_KEYS[key];
  if (value.trim().length === 0) {
    params.delete(paramKey);
  } else {
    params.set(paramKey, value);
  }
  const qs = params.toString();
  return qs.length > 0 ? `${pathname}?${qs}` : pathname;
}

export function buildClearFiltersUrl(
  pathname: string,
  searchParams: URLSearchParams,
): string {
  const params = new URLSearchParams(searchParams.toString());
  for (const key of Object.values(PLANNING_FILTER_KEYS)) params.delete(key);
  const qs = params.toString();
  return qs.length > 0 ? `${pathname}?${qs}` : pathname;
}

/* ------------------------------------------------------------------ */
/*  Derived view state (pure)                                          */
/* ------------------------------------------------------------------ */

export function deriveViewState(
  allSelected: boolean,
  selectedProjectIds: string[],
  state: BoardState,
): { singleProjectId: string | null; viewState: BoardState } {
  const singleProjectId =
    !allSelected && selectedProjectIds.length === 1
      ? selectedProjectIds[0]
      : null;

  const viewState: BoardState = !singleProjectId
    ? { kind: "no-project" }
    : state.kind !== "no-project" && state.projectId === singleProjectId
      ? state
      : { kind: "loading", projectId: singleProjectId };

  return { singleProjectId, viewState };
}

export function applyBoardFilters(
  viewState: BoardState,
  filters: PlanningFiltersValue,
): BoardState {
  if (viewState.kind !== "ok") return viewState;
  return {
    ...viewState,
    data: {
      ...viewState.data,
      stories: applyPlanningStoryFilters(viewState.data.stories, filters),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Filter option builders (pure)                                      */
/* ------------------------------------------------------------------ */

export interface BoardFilterOptions {
  statusOptions: readonly PlanningFilterOption[];
  typeOptions: readonly PlanningFilterOption[];
  labelOptions: readonly PlanningFilterOption[];
  epicOptions: readonly PlanningFilterOption[];
  assigneeFilterOptions: readonly PlanningFilterOption[];
}

export function buildBoardFilterOptions(
  viewState: BoardState,
  assigneeOptions: QuickCreateAssigneeOption[],
): BoardFilterOptions {
  const allStories = viewState.kind === "ok" ? viewState.data.stories : [];
  return {
    statusOptions: buildStoryStatusOptions(allStories),
    typeOptions: buildStoryTypeOptions(allStories),
    labelOptions: buildStoryLabelOptions(allStories),
    epicOptions: buildStoryEpicOptions(allStories),
    assigneeFilterOptions: [
      { value: UNASSIGNED_FILTER_VALUE, label: "Unassigned" },
      ...assigneeOptions.map((option) => ({
        value: option.id,
        label: option.role ? `${option.name} · ${option.role}` : option.name,
      })),
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Board summary (pure)                                               */
/* ------------------------------------------------------------------ */

export interface BoardSummary {
  sprintName: string;
  total: number;
  done: number;
  pctDone: number;
}

export function computeBoardSummary(
  visibleState: BoardState,
): BoardSummary | null {
  if (visibleState.kind !== "ok") return null;
  const total = visibleState.data.stories.length;
  const done = visibleState.data.stories.filter(
    (story) => story.status === "DONE",
  ).length;
  const pctDone = total > 0 ? Math.round((done / total) * 100) : 0;
  return {
    sprintName: visibleState.data.backlog.name,
    total,
    done,
    pctDone,
  };
}

/* ------------------------------------------------------------------ */
/*  Selection helpers (pure)                                           */
/* ------------------------------------------------------------------ */

export function findSelectedStoryLabels(
  state: BoardState,
  selectedStoryId: string | null,
): undefined | Array<{ id: string; name: string; color: string | null }> {
  if (state.kind !== "ok" || !selectedStoryId) return undefined;
  return state.data.stories.find((story) => story.id === selectedStoryId)
    ?.labels;
}

/* ------------------------------------------------------------------ */
/*  Pending-ID helper (pure)                                           */
/* ------------------------------------------------------------------ */

export function removePendingId(
  prev: Record<string, true>,
  storyId: string,
): Record<string, true> {
  const next = { ...prev };
  delete next[storyId];
  return next;
}

/* ------------------------------------------------------------------ */
/*  Quick-create enrichment (pure)                                     */
/* ------------------------------------------------------------------ */

export function enrichCreatedStory(
  created: StoryCardStory,
  assigneeAgentId: string | null,
  assigneeOptions: QuickCreateAssigneeOption[],
): StoryCardStory {
  const match = assigneeOptions.find((opt) => opt.id === assigneeAgentId) ?? null;
  return {
    ...created,
    assignee_agent_id: assigneeAgentId,
    assignee_name: match?.name ?? null,
    assignee_last_name: match?.last_name ?? null,
    assignee_initials: match?.initials ?? null,
    assignee_avatar: match?.avatar ?? null,
  };
}

export function insertCreatedStory(
  prev: BoardState,
  projectId: string,
  story: StoryCardStory,
): BoardState {
  if (prev.kind !== "ok" || prev.projectId !== projectId) return prev;
  const shiftedStories = prev.data.stories.map((s) =>
    s.status === "TODO" ? { ...s, position: s.position + 1 } : s,
  );
  return { ...prev, data: { ...prev.data, stories: [story, ...shiftedStories] } };
}
