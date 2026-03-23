import type { ComponentType } from "react";

import type { BacklogKind, WorkItemStatus } from "@/lib/planning/types";

export const STORY_ACTIONS_SUPPORTED_TYPES = ["USER_STORY", "TASK", "BUG"] as const;

export const STORY_STATUS_ORDER: readonly WorkItemStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "CODE_REVIEW",
  "VERIFY",
  "DONE",
] as const;

export function isStoryActionsSupportedType(storyType: string | null | undefined): boolean {
  if (!storyType) return false;
  const normalized = storyType.trim().toUpperCase();
  return STORY_ACTIONS_SUPPORTED_TYPES.includes(
    normalized as (typeof STORY_ACTIONS_SUPPORTED_TYPES)[number],
  );
}

export type DeleteConfirmPhase = "closed" | "open" | "submitting";
export type DeleteConfirmEvent = "OPEN" | "CANCEL" | "CONFIRM" | "FINISH";

export function reduceDeleteConfirmPhase(
  phase: DeleteConfirmPhase,
  event: DeleteConfirmEvent,
): DeleteConfirmPhase {
  if (event === "OPEN") return phase === "closed" ? "open" : phase;
  if (event === "CANCEL") return phase === "submitting" ? phase : "closed";
  if (event === "CONFIRM") return phase === "open" ? "submitting" : phase;
  if (event === "FINISH") return "closed";
  return phase;
}

export type ActiveZone = "main" | "status" | "backlog";

export interface BacklogMembershipTarget {
  id: string;
  name: string;
  kind: BacklogKind;
  isMember: boolean;
  /** This is the backlog the item is currently displayed in — cannot remove from it. */
  isCurrentBacklog: boolean;
  isActive: boolean;
  isDefault: boolean;
}

export interface BacklogMembershipActions {
  targets: readonly BacklogMembershipTarget[];
  /** Move the item from its current backlog to the target backlog. */
  onMove: (storyId: string, targetBacklogId: string) => void | Promise<void>;
  disabled?: boolean;
}

export type MainAction =
  | "copy-key"
  | "add-label"
  | "toggle-sprint-membership"
  | "change-status"
  | "add-flag"
  | "link-work-item"
  | "link-parent"
  | "archive"
  | "delete";

export interface MenuActionItem {
  id: MainAction;
  label: string;
  tone?: "default" | "danger";
  disabled: boolean;
  submenu?: boolean;
  icon: ComponentType<{ className?: string }>;
}

export const SECTION_GROUPS: ReadonlyArray<ReadonlyArray<MainAction>> = [
  ["copy-key", "add-label", "toggle-sprint-membership"],
  ["change-status"],
  ["add-flag", "link-work-item", "link-parent", "archive"],
  ["delete"],
] as const;

export interface StoryActionsMenuProps {
  storyId: string;
  storyType: string | null | undefined;
  storyKey: string | null;
  storyTitle: string;
  storyStatus?: WorkItemStatus;
  onDelete: (storyId: string) => void | Promise<void>;
  onStatusChange?: (storyId: string, status: WorkItemStatus) => void | Promise<void>;
  onAddLabel?: (storyId: string) => void;
  backlogMembershipActions?: BacklogMembershipActions;
  disabled?: boolean;
  isDeleting?: boolean;
  defaultOpen?: boolean;
  defaultConfirmOpen?: boolean;
  defaultStatusSubmenuOpen?: boolean;
}
