import type { BacklogAssigneeOption } from "@/components/planning/backlog-row";
import {
  PLANNING_FILTER_KEYS,
  type PlanningFiltersValue,
} from "@/components/planning/planning-filters";
import type { WorkItemStatus } from "@/lib/planning/types";

import {
  buildStatusOptions,
  buildTypeOptions,
  type OptionItem,
} from "./list-filters";
import type {
  PlanningEpicApiItem,
  PlanningListLabel,
  PlanningListRow,
} from "./list-view-model";

export interface DerivedFilterOptions {
  statusOptions: OptionItem[];
  typeOptions: OptionItem[];
  labelOptions: OptionItem[];
  epicOptions: OptionItem[];
  assigneeOptions: OptionItem[];
  assignableAgents: BacklogAssigneeOption[];
}

export function deriveFilterOptions(
  state: {
    kind: string;
    rows?: PlanningListRow[];
    labels?: PlanningListLabel[];
    epics?: PlanningEpicApiItem[];
    assignees?: Array<{ id: string; label: string }>;
    assignableAgents?: BacklogAssigneeOption[];
  },
  unassignedValue: string,
): DerivedFilterOptions {
  if (state.kind !== "ok" || !state.rows) {
    return {
      statusOptions: [],
      typeOptions: [],
      labelOptions: [],
      epicOptions: [],
      assigneeOptions: [{ value: unassignedValue, label: "Unassigned" }],
      assignableAgents: [],
    };
  }

  return {
    statusOptions: buildStatusOptions(state.rows),
    typeOptions: buildTypeOptions(state.rows),
    labelOptions: (state.labels ?? []).map((label) => ({
      value: label.id,
      label: label.name,
    })),
    epicOptions: (state.epics ?? []).map((epic) => ({
      value: epic.id,
      label: `${epic.key} ${epic.title}`,
    })),
    assigneeOptions: [
      { value: unassignedValue, label: "Unassigned" },
      ...(state.assignees ?? []).map((assignee) => ({
        value: assignee.id,
        label: assignee.label,
      })),
    ],
    assignableAgents: state.assignableAgents ?? [],
  };
}

export interface DerivedSelections {
  activeSelectedStoryId: string | null;
  activeSelectedTaskRow: PlanningListRow | null;
  selectedStoryLabels: PlanningListLabel[] | undefined;
}

export function deriveSelections(
  stateKind: string,
  visibleRows: PlanningListRow[],
  selectedStoryId: string | null,
  selectedTaskRow: PlanningListRow | null,
): DerivedSelections {
  const activeSelectedStoryId =
    stateKind === "ok" &&
    selectedStoryId &&
    visibleRows.some((row) => row.row_type === "story" && row.id === selectedStoryId)
      ? selectedStoryId
      : null;

  const activeSelectedTaskRow =
    stateKind === "ok" &&
    selectedTaskRow &&
    visibleRows.some((row) => row.row_type === "task" && row.id === selectedTaskRow.id)
      ? selectedTaskRow
      : null;

  const selectedStoryLabels =
    stateKind === "ok" && activeSelectedStoryId
      ? visibleRows.find((row) => row.row_type === "story" && row.id === activeSelectedStoryId)
          ?.labels
      : undefined;

  return { activeSelectedStoryId, activeSelectedTaskRow, selectedStoryLabels };
}

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
  params.delete(PLANNING_FILTER_KEYS.search);
  params.delete(PLANNING_FILTER_KEYS.status);
  params.delete(PLANNING_FILTER_KEYS.type);
  params.delete(PLANNING_FILTER_KEYS.labelId);
  params.delete(PLANNING_FILTER_KEYS.epicId);
  params.delete(PLANNING_FILTER_KEYS.assignee);
  const qs = params.toString();
  return qs.length > 0 ? `${pathname}?${qs}` : pathname;
}
