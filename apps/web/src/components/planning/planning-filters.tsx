"use client";

import { Filter, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemedSelect, type ThemedSelectOption } from "@/components/ui/themed-select";
import { cn } from "@/lib/utils";

import { hasActivePlanningFilters, type PlanningFilterOption, type PlanningFiltersValue } from "./planning-filter-logic.js";

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
} from "./planning-filter-logic.js";

interface PlanningFiltersProps {
  value: PlanningFiltersValue;
  onChange: (key: keyof PlanningFiltersValue, value: string) => void;
  onClear: () => void;
  searchPlaceholder?: string;
  disabled?: boolean;
  statusOptions: readonly PlanningFilterOption[];
  typeOptions: readonly PlanningFilterOption[];
  labelOptions: readonly PlanningFilterOption[];
  epicOptions: readonly PlanningFilterOption[];
  assigneeOptions: readonly PlanningFilterOption[];
  className?: string;
}

function buildSelectOptions(
  allLabel: string,
  options: readonly PlanningFilterOption[],
): ThemedSelectOption[] {
  return [{ value: "", label: allLabel }, ...options];
}

export function PlanningFilters({
  value,
  onChange,
  onClear,
  searchPlaceholder = "Search by key or title",
  disabled = false,
  statusOptions,
  typeOptions,
  labelOptions,
  epicOptions,
  assigneeOptions,
  className,
}: PlanningFiltersProps) {
  return (
    <div className={cn("flex w-full flex-wrap items-center gap-2 xl:flex-nowrap", className)}>
      <div className="relative min-w-[280px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={value.search}
          onChange={(event) => {
            onChange("search", event.target.value);
          }}
          disabled={disabled}
          placeholder={searchPlaceholder}
          aria-label="Search work items"
          className={cn(
            "h-8 w-full rounded-md border border-border/60 bg-background/80 pl-8 pr-3 text-sm text-foreground",
            "placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            disabled && "cursor-not-allowed text-muted-foreground",
          )}
        />
      </div>

      <div className="flex w-full flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2 py-1.5 sm:w-auto sm:flex-nowrap">
        <Filter className="size-3.5 text-muted-foreground" />

        <ThemedSelect
          value={value.status}
          options={buildSelectOptions("Status: All", statusOptions)}
          placeholder="Status"
          disabled={disabled}
          onValueChange={(next) => {
            onChange("status", next);
          }}
          triggerClassName="h-8 min-w-[120px] bg-background/70 text-xs"
          contentClassName="w-[180px]"
        />

        <ThemedSelect
          value={value.type}
          options={buildSelectOptions("Type: All", typeOptions)}
          placeholder="Type"
          disabled={disabled}
          onValueChange={(next) => {
            onChange("type", next);
          }}
          triggerClassName="h-8 min-w-[120px] bg-background/70 text-xs"
          contentClassName="w-[180px]"
        />

        <ThemedSelect
          value={value.labelId}
          options={buildSelectOptions("Label: All", labelOptions)}
          placeholder="Label"
          disabled={disabled}
          onValueChange={(next) => {
            onChange("labelId", next);
          }}
          triggerClassName="h-8 min-w-[128px] bg-background/70 text-xs"
          contentClassName="w-[220px]"
        />

        <ThemedSelect
          value={value.epicId}
          options={buildSelectOptions("Epic: All", epicOptions)}
          placeholder="Epic"
          disabled={disabled}
          onValueChange={(next) => {
            onChange("epicId", next);
          }}
          triggerClassName="h-8 min-w-[136px] bg-background/70 text-xs"
          contentClassName="w-[240px]"
        />

        <ThemedSelect
          value={value.assignee}
          options={buildSelectOptions("Assignee: All", assigneeOptions)}
          placeholder="Assignee"
          disabled={disabled}
          onValueChange={(next) => {
            onChange("assignee", next);
          }}
          triggerClassName="h-8 min-w-[136px] bg-background/70 text-xs"
          contentClassName="w-[240px]"
        />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || !hasActivePlanningFilters(value)}
          onClick={onClear}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
