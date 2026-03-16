/**
 * Types for the backlog page.
 * Pure type definitions — no React, no side effects.
 */

import type { BacklogKind, BacklogStatus } from "@/lib/planning/types";
import type { BacklogAssigneeOption } from "@/components/planning/backlog-row";
import type { StoryCardStory } from "@/components/planning/story-card";
import type { PlanningFilterOption } from "@/components/planning/planning-filters";

export interface BacklogItem {
  id: string;
  name: string;
  kind: BacklogKind;
  status: BacklogStatus;
  display_order?: number;
  is_default: boolean;
  goal: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface BacklogWithStories {
  backlog: BacklogItem;
  stories: StoryCardStory[];
}

export type PageState =
  | { kind: "no-project" }
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      sections: BacklogWithStories[];
      assignees: PlanningFilterOption[];
      assignableAgents: BacklogAssigneeOption[];
    };

export type FetchResult =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      sections: BacklogWithStories[];
      assignees: PlanningFilterOption[];
      assignableAgents: BacklogAssigneeOption[];
    };

export interface ScopedFetchResult {
  projectId: string;
  result: FetchResult;
}

export interface SprintCompleteDialogState {
  backlogId: string;
  backlogName: string;
  completedCount: number;
  openStories: StoryCardStory[];
}

export interface SprintStartDialogState {
  backlogId: string;
  backlogName: string;
}

export interface SprintCompleteConfirmDialogState {
  backlogId: string;
  backlogName: string;
}

export interface DeleteBoardDialogState {
  backlogId: string;
  backlogName: string;
}

export interface PlanningAgentApiItem {
  id?: string;
  name?: string;
  last_name?: string | null;
  initials?: string | null;
  role?: string | null;
  avatar?: string | null;
}

export const KIND_CONFIG: Record<BacklogKind, { label: string }> = {
  SPRINT: { label: "Sprint" },
  BACKLOG: { label: "Backlog" },
  IDEAS: { label: "Ideas" },
};

export const BOARD_KIND_OPTIONS: readonly { value: BacklogKind; label: string }[] = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "SPRINT", label: "Sprint" },
  { value: "IDEAS", label: "Ideas" },
];
