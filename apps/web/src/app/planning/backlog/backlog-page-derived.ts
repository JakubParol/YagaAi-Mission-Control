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
import type { StoryCardStory } from "@/components/planning/story-card";
import type { BacklogMembershipTarget } from "@/components/planning/story-actions-menu-types";

import type { BacklogItem, BacklogWithItems, PageState } from "./backlog-types";
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

// ── Backlog membership helpers ───────────────────────────────────────

/**
 * Build a map: storyId → Set of backlogIds the story belongs to.
 * Scans all sections once — O(total items).
 */
export function buildStoryBacklogMembership(
  sections: readonly BacklogWithItems[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const section of sections) {
    for (const item of section.items) {
      let set = map.get(item.id);
      if (!set) { set = new Set(); map.set(item.id, set); }
      set.add(section.backlog.id);
    }
  }
  return map;
}

/**
 * Build the list of backlog targets for the "Manage backlogs" submenu.
 * Returns all non-closed backlogs with isMember flag per story.
 */
export function buildBacklogTargetsForStory(
  sections: readonly BacklogWithItems[],
  storyId: string,
  membershipMap: Map<string, Set<string>>,
): BacklogMembershipTarget[] {
  const memberOf = membershipMap.get(storyId) ?? new Set<string>();
  return sections
    .filter((s) => s.backlog.status !== "CLOSED")
    .map((s) => ({
      id: s.backlog.id,
      name: s.backlog.name,
      kind: s.backlog.kind,
      isMember: memberOf.has(s.backlog.id),
    }));
}

// Re-export board helpers that were extracted for file-size compliance.
export {
  computeBoardSwapTarget,
  prepareSprintCompletion,
  buildEditBoardItem,
  type BoardSwapTarget,
  type MoveDirection,
  type SprintCompletionResult,
} from "./backlog-page-board-helpers";
