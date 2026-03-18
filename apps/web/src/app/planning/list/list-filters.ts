import type { WorkItemStatus } from "@/lib/planning/types";
import {
  applyPlanningFilters,
  PLANNING_FILTER_KEYS,
  UNASSIGNED_FILTER_VALUE,
} from "@/components/planning/planning-filters";

import type { PlanningListRow } from "./list-view-model";

export const LIST_FILTER_KEYS = PLANNING_FILTER_KEYS;
export { UNASSIGNED_FILTER_VALUE };

export interface PlanningListFilters {
  search: string;
  status: WorkItemStatus | "";
  type: string;
  labelId: string;
  epicId: string;
  assignee: string;
}

export interface OptionItem {
  value: string;
  label: string;
}

function normalizeType(row: PlanningListRow): string {
  return row.row_type === "task" ? "TASK" : (row.sub_type ?? row.type);
}

export function applyPlanningListFilters(
  rows: PlanningListRow[],
  filters: PlanningListFilters,
): PlanningListRow[] {
  return applyPlanningFilters(rows, filters, (row) => ({
    key: row.key,
    title: row.title,
    status: row.status,
    type: normalizeType(row),
    labelIds: row.labels.map((label) => label.id),
    epicId: row.parent_id,
    assigneeId: row.current_assignee_agent_id,
  }));
}

export function buildTypeOptions(rows: PlanningListRow[]): OptionItem[] {
  const values = new Set<string>();
  for (const row of rows) {
    values.add(normalizeType(row));
  }

  return [...values]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value.replaceAll("_", " ") }));
}

export function buildStatusOptions(rows: PlanningListRow[]): OptionItem[] {
  const values = new Set<WorkItemStatus>();
  for (const row of rows) {
    values.add(row.status);
  }

  return [...values]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value.replaceAll("_", " ") }));
}
