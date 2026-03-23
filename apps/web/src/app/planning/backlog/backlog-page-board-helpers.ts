/**
 * Board move/swap and sprint-completion helpers.
 * Extracted from backlog-page-derived.ts for file-size compliance.
 */

import type { StoryCardStory } from "@/components/planning/story-card";
import type { BacklogEditItem } from "@/components/planning/backlog-edit-dialog";

import type { PageState, SprintCompleteDialogState } from "./backlog-types";
import { isCompleteSprintTarget } from "./backlog-view-model";

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
