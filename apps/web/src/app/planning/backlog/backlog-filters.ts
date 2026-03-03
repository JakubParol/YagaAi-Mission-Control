import type { BacklogKind, BacklogStatus } from "@/lib/planning/types";

export interface BacklogFilterItem {
  id: string;
  kind: BacklogKind;
  status: BacklogStatus;
}

export function excludeClosedSprintBacklogs<T extends BacklogFilterItem>(
  backlogs: readonly T[],
): T[] {
  return backlogs.filter(
    (backlog) => !(backlog.kind === "SPRINT" && backlog.status === "CLOSED"),
  );
}
