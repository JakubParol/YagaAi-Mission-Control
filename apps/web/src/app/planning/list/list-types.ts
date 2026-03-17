import type { BacklogAssigneeOption } from "@/components/planning/backlog-row";

import type { PlanningEpicApiItem, PlanningListLabel, PlanningListRow } from "./list-view-model";

export interface PlanningBacklogApiItem {
  id: string;
}

export interface PlanningAgentApiItem {
  id?: string;
  name?: string;
  last_name?: string | null;
  initials?: string | null;
  role?: string | null;
  avatar?: string | null;
}

export interface PlanningListAssigneeOption {
  id: string;
  label: string;
}

export type FetchResult =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      rows: PlanningListRow[];
      epics: PlanningEpicApiItem[];
      labels: PlanningListLabel[];
      assignees: PlanningListAssigneeOption[];
      assignableAgents: BacklogAssigneeOption[];
    };

export interface ScopedFetchResult {
  projectId: string;
  result: FetchResult;
}

export type PageState =
  | { kind: "no-project" }
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      rows: PlanningListRow[];
      epics: PlanningEpicApiItem[];
      labels: PlanningListLabel[];
      assignees: PlanningListAssigneeOption[];
      assignableAgents: BacklogAssigneeOption[];
    };
