/**
 * Pure derived-state helpers for the backlog page.
 * No React, no side effects — easy to test.
 */

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
import type { BacklogAssigneeOption } from "@/components/planning/backlog-row";
import type { BacklogEditItem } from "@/components/planning/backlog-edit-dialog";
import type { StoryCardStory } from "@/components/planning/story-card";

import type { BacklogItem, BacklogWithItems, PageState, SprintCompleteDialogState } from "./backlog-types";
import { isCompleteSprintTarget } from "./backlog-view-model";

// ── URL filter helpers ───────────────────────────────────────────────

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
  if (value.trim().length === 0) params.delete(paramKey);
  else params.set(paramKey, value);
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

// ── Filtered sections ────────────────────────────────────────────────

export function computeFilteredSections(
  state: PageState,
  filters: PlanningFiltersValue,
): BacklogWithItems[] {
  if (state.kind !== "ok") return [];
  return state.sections.map((section) => ({
    ...section,
    items: applyPlanningStoryFilters(section.items, filters),
  }));
}

// ── Filter option builders ───────────────────────────────────────────

export interface BacklogFilterOptions {
  statusOptions: readonly PlanningFilterOption[];
  typeOptions: readonly PlanningFilterOption[];
  labelOptions: readonly PlanningFilterOption[];
  epicOptions: readonly PlanningFilterOption[];
  assigneeOptions: readonly PlanningFilterOption[];
}

export function buildBacklogFilterOptions(
  state: PageState,
): BacklogFilterOptions {
  const allStories: StoryCardStory[] =
    state.kind === "ok" ? state.sections.flatMap((s) => s.items) : [];
  return {
    statusOptions: buildStoryStatusOptions(allStories),
    typeOptions: buildStoryTypeOptions(allStories),
    labelOptions: buildStoryLabelOptions(allStories),
    epicOptions: buildStoryEpicOptions(allStories),
    assigneeOptions: [
      { value: UNASSIGNED_FILTER_VALUE, label: "Unassigned" },
      ...(state.kind === "ok" ? state.assignees : []),
    ],
  };
}

export function getAssignableAgents(state: PageState): readonly BacklogAssigneeOption[] {
  return state.kind === "ok" ? state.assignableAgents : [];
}

// ── Work-item stats ──────────────────────────────────────────────────

export interface WorkItemStats {
  total: number;
  visible: number;
}

export function computeWorkItemStats(
  state: PageState,
  filteredSections: readonly BacklogWithItems[],
): WorkItemStats {
  if (state.kind !== "ok") return { total: 0, visible: 0 };
  const countItems = (sections: readonly BacklogWithItems[]) =>
    sections.reduce(
      (acc, s) => acc + s.items.length + s.items.reduce((t, st) => t + st.children_count, 0),
      0,
    );
  return {
    total: countItems(state.sections),
    visible: countItems(filteredSections),
  };
}

// ── Sprint / board derived flags ─────────────────────────────────────

export function hasAnyActiveSprint(state: PageState): boolean {
  return (
    state.kind === "ok" &&
    state.sections.some((s) => s.backlog.kind === "SPRINT" && s.backlog.status === "ACTIVE")
  );
}

export function findDefaultBacklogId(state: PageState): string | null {
  if (state.kind !== "ok") return null;
  return state.sections.find((s) => s.backlog.is_default)?.backlog.id ?? null;
}

// ── Sprint-complete dialog targets ───────────────────────────────────

export function computeCompleteDialogTargets(
  state: PageState,
  sourceBacklogId: string | null,
): BacklogItem[] {
  if (state.kind !== "ok" || !sourceBacklogId) return [];
  return state.sections
    .map((s) => s.backlog)
    .filter((b) => isCompleteSprintTarget(b, sourceBacklogId));
}

// ── Story selection helpers ──────────────────────────────────────────

export function resolveActiveSelectedStoryId(
  state: PageState,
  selectedStoryId: string | null,
): string | null {
  if (state.kind !== "ok" || !selectedStoryId) return null;
  return state.sections.some((s) => s.items.some((st) => st.id === selectedStoryId))
    ? selectedStoryId
    : null;
}

export function resolveSelectedStoryLabels(
  state: PageState,
  activeSelectedStoryId: string | null,
): Array<{ id: string; name: string; color: string | null }> | undefined {
  if (state.kind !== "ok" || !activeSelectedStoryId) return undefined;
  return state.sections
    .flatMap((s) => s.items)
    .find((st) => st.id === activeSelectedStoryId)?.labels;
}

// ── Pending-ID helper ────────────────────────────────────────────────

export function removePendingId(
  prev: Record<string, true>,
  id: string,
): Record<string, true> {
  const next = { ...prev };
  delete next[id];
  return next;
}

// ── Board move helpers ───────────────────────────────────────────────

export interface BoardSwapTarget {
  currentId: string;
  currentRank: string;
  swapWithId: string;
  swapWithRank: string;
}

export type MoveDirection = "top" | "up" | "down" | "bottom";

export function computeBoardSwapTarget(
  state: PageState,
  backlogId: string,
  direction: MoveDirection,
): BoardSwapTarget | null {
  if (state.kind !== "ok") return null;
  const moveable = state.sections
    .map((s) => s.backlog)
    .filter((b) => !(b.kind === "SPRINT" && b.status === "ACTIVE") && !b.is_default);
  const currentIndex = moveable.findIndex((b) => b.id === backlogId);
  if (currentIndex === -1) return null;

  let swapIndex: number;
  if (direction === "top") swapIndex = 0;
  else if (direction === "up") swapIndex = currentIndex - 1;
  else if (direction === "down") swapIndex = currentIndex + 1;
  else swapIndex = moveable.length - 1;

  if (swapIndex === currentIndex || swapIndex < 0 || swapIndex >= moveable.length) return null;

  const current = moveable[currentIndex];
  const swapWith = moveable[swapIndex];
  return {
    currentId: current.id,
    currentRank: current.rank,
    swapWithId: swapWith.id,
    swapWithRank: swapWith.rank,
  };
}

// ── Sprint completion preparation ────────────────────────────────────

export type SprintCompletionResult =
  | { outcome: "error"; message: string }
  | { outcome: "no-open-stories"; backlogId: string; backlogName: string }
  | {
      outcome: "has-open-stories";
      dialog: SprintCompleteDialogState;
      defaultTargetId: string;
    };

export function prepareSprintCompletion(
  state: PageState,
  backlogId: string,
  backlogName: string,
): SprintCompletionResult {
  if (state.kind !== "ok") {
    return { outcome: "error", message: "Sprint data is not available. Refresh and try again." };
  }
  const section = state.sections.find((s) => s.backlog.id === backlogId);
  if (!section) {
    return { outcome: "error", message: "Sprint was not found in current view. Refresh and try again." };
  }
  const openStories: StoryCardStory[] = section.items.filter((s) => s.status !== "DONE");
  if (openStories.length === 0) {
    return { outcome: "no-open-stories", backlogId, backlogName };
  }
  const targets = state.sections
    .map((s) => s.backlog)
    .filter((b) => isCompleteSprintTarget(b, backlogId));
  if (targets.length === 0) {
    return { outcome: "error", message: "No target sprint/backlog is available for open work items. Create one first." };
  }
  const defaultTargetId = targets.find((b) => b.is_default)?.id ?? targets[0].id;
  return {
    outcome: "has-open-stories",
    dialog: {
      backlogId,
      backlogName,
      completedCount: section.items.filter((s) => s.status === "DONE").length,
      openStories,
    },
    defaultTargetId,
  };
}

// ── Board edit item builder ──────────────────────────────────────────

export function buildEditBoardItem(
  state: PageState,
  backlogId: string,
): BacklogEditItem | null {
  if (state.kind !== "ok") return null;
  const section = state.sections.find((s) => s.backlog.id === backlogId);
  if (!section) return null;
  const { backlog } = section;
  return {
    id: backlog.id,
    name: backlog.name,
    kind: backlog.kind,
    status: backlog.status,
    goal: backlog.goal,
    start_date: backlog.start_date,
    end_date: backlog.end_date,
    is_default: backlog.is_default,
  };
}
