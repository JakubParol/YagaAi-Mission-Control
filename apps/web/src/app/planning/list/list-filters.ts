import type { ItemStatus } from "@/lib/planning/types";
import {
  PLANNING_FILTER_KEYS,
  UNASSIGNED_FILTER_VALUE,
} from "@/components/planning/planning-filters";

import type { PlanningListRow } from "./list-view-model";

export const LIST_FILTER_KEYS = PLANNING_FILTER_KEYS;
export { UNASSIGNED_FILTER_VALUE };

export interface PlanningListFilters {
  search: string;
  status: ItemStatus | "";
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
  return row.row_type === "task" ? "TASK" : (row.story_type ?? "STORY");
}

export function applyPlanningListFilters(
  rows: PlanningListRow[],
  filters: PlanningListFilters,
): PlanningListRow[] {
  const normalizedSearch = filters.search.trim().toLowerCase();

  return rows.filter((row) => {
    if (normalizedSearch.length > 0) {
      const key = row.key?.toLowerCase() ?? "";
      const title = row.title.toLowerCase();
      if (!key.includes(normalizedSearch) && !title.includes(normalizedSearch)) {
        return false;
      }
    }

    if (filters.status !== "" && row.status !== filters.status) {
      return false;
    }

    if (filters.type !== "" && normalizeType(row) !== filters.type) {
      return false;
    }

    if (filters.labelId !== "" && !row.labels.some((label) => label.id === filters.labelId)) {
      return false;
    }

    if (filters.epicId !== "" && row.epic_id !== filters.epicId) {
      return false;
    }

    if (filters.assignee !== "") {
      if (filters.assignee === UNASSIGNED_FILTER_VALUE) {
        if (row.current_assignee_agent_id !== null) {
          return false;
        }
      } else if (row.current_assignee_agent_id !== filters.assignee) {
        return false;
      }
    }

    return true;
  });
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
  const values = new Set<ItemStatus>();
  for (const row of rows) {
    values.add(row.status);
  }

  return [...values]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value.replaceAll("_", " ") }));
}
