import type { BacklogKind, BacklogStatus } from "@/lib/planning/types";

export interface BacklogFilterItem {
  id: string;
  kind: BacklogKind;
  status: BacklogStatus;
  rank?: string;
  is_default?: boolean;
  created_at?: string;
}

export function excludeClosedSprintBacklogs<T extends BacklogFilterItem>(
  backlogs: readonly T[],
): T[] {
  return backlogs.filter(
    (backlog) => !(backlog.kind === "SPRINT" && backlog.status === "CLOSED"),
  );
}

function backlogSortPriority(backlog: BacklogFilterItem): number {
  if (backlog.kind === "SPRINT" && backlog.status === "ACTIVE") return 0;
  if (Boolean(backlog.is_default)) return 2;
  return 1;
}

function compareNullableString(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a.localeCompare(b);
}

/**
 * Planning backlog ordering contract:
 * 1) ACTIVE sprint on top
 * 2) non-default backlogs/sprints in the middle by rank
 * 3) default backlog pinned to the very bottom
 */
export function sortBacklogsForPlanning<T extends BacklogFilterItem>(backlogs: readonly T[]): T[] {
  return [...backlogs].sort((left, right) => {
    const priorityDelta = backlogSortPriority(left) - backlogSortPriority(right);
    if (priorityDelta !== 0) return priorityDelta;

    const displayOrderDelta = compareNullableString(left.rank, right.rank);
    if (displayOrderDelta !== 0) return displayOrderDelta;

    const createdAtDelta = (left.created_at ?? "").localeCompare(right.created_at ?? "");
    if (createdAtDelta !== 0) return createdAtDelta;

    return left.id.localeCompare(right.id);
  });
}
