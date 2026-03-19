"use client";

import { ThemedSelect, type ThemedSelectOption } from "@/components/ui/themed-select";

import { type PlanningFilterOption, type PlanningFiltersValue } from "./planning-filter-logic";

// Re-export all logic so existing imports from this module keep working.
export {
  applyPlanningFilters,
  applyPlanningStoryFilters,
  buildStoryEpicOptions,
  buildStoryLabelOptions,
  buildStoryStatusOptions,
  buildStoryTypeOptions,
  hasActivePlanningFilters,
  PLANNING_FILTER_KEYS,
  UNASSIGNED_FILTER_VALUE,
  type PlanningFilterCandidate,
  type PlanningFilterOption,
  type PlanningFiltersValue,
  type PlanningStoryFilterItem,
} from "./planning-filter-logic";

interface PlanningFiltersProps {
  value: PlanningFiltersValue;
  onChange: (key: keyof PlanningFiltersValue, value: string) => void;
  disabled?: boolean;
  statusOptions: readonly PlanningFilterOption[];
  typeOptions: readonly PlanningFilterOption[];
  labelOptions: readonly PlanningFilterOption[];
  epicOptions: readonly PlanningFilterOption[];
  assigneeOptions: readonly PlanningFilterOption[];
}

function sel(allLabel: string, options: readonly PlanningFilterOption[]): ThemedSelectOption[] {
  return [{ value: "", label: allLabel }, ...options];
}

export function PlanningFilters({
  value,
  onChange,
  disabled = false,
  statusOptions,
  typeOptions,
  labelOptions,
  epicOptions,
  assigneeOptions,
}: PlanningFiltersProps) {
  return (
    <>
      <ThemedSelect value={value.status} options={sel("Status: All", statusOptions)} placeholder="Status" disabled={disabled} onValueChange={(v) => onChange("status", v)} triggerClassName="h-8 w-auto min-w-[105px] shrink-0 bg-background/70 text-xs" contentClassName="w-[180px]" />
      <ThemedSelect value={value.type} options={sel("Type: All", typeOptions)} placeholder="Type" disabled={disabled} onValueChange={(v) => onChange("type", v)} triggerClassName="h-8 w-auto min-w-[95px] shrink-0 bg-background/70 text-xs" contentClassName="w-[180px]" />
      <ThemedSelect value={value.labelId} options={sel("Label: All", labelOptions)} placeholder="Label" disabled={disabled} onValueChange={(v) => onChange("labelId", v)} triggerClassName="h-8 w-auto min-w-[95px] shrink-0 max-w-[160px] bg-background/70 text-xs" contentClassName="w-[220px]" />
      <ThemedSelect value={value.epicId} options={sel("Epic: All", epicOptions)} placeholder="Epic" disabled={disabled} onValueChange={(v) => onChange("epicId", v)} triggerClassName="h-8 w-auto min-w-[95px] shrink-0 max-w-[180px] bg-background/70 text-xs" contentClassName="w-[240px]" />
      <ThemedSelect value={value.assignee} options={sel("Assignee: All", assigneeOptions)} placeholder="Assignee" disabled={disabled} onValueChange={(v) => onChange("assignee", v)} triggerClassName="h-8 w-auto min-w-[115px] shrink-0 max-w-[180px] bg-background/70 text-xs" contentClassName="w-[240px]" />
    </>
  );
}
