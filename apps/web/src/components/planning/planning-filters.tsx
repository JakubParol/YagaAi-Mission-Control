"use client";

import { Filter, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemedSelect, type ThemedSelectOption } from "@/components/ui/themed-select";
import type { ItemStatus } from "@/lib/planning/types";
import { cn } from "@/lib/utils";

export const PLANNING_FILTER_KEYS = {
  search: "q",
  status: "status",
  type: "type",
  labelId: "label",
  epicId: "epic",
  assignee: "assignee",
} as const;

export const UNASSIGNED_FILTER_VALUE = "unassigned";

export interface PlanningFiltersValue {
  search: string;
  status: ItemStatus | "";
  type: string;
  labelId: string;
  epicId: string;
  assignee: string;
}

export interface PlanningFilterOption {
  value: string;
  label: string;
}

export interface PlanningStoryFilterItem {
  id?: string;
  key: string | null;
  title: string;
  status: ItemStatus;
  story_type: string;
  labels?: readonly { id: string; name?: string | null }[];
  epic_id?: string | null;
  epic_key?: string | null;
  epic_title?: string | null;
  current_assignee_agent_id?: string | null;
  assignee_agent_id?: string | null;
}

function normalizeLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function normalizeAssigneeId(item: PlanningStoryFilterItem): string | null {
  return item.current_assignee_agent_id ?? item.assignee_agent_id ?? null;
}

export function hasActivePlanningFilters(value: PlanningFiltersValue): boolean {
  return (
    value.search.trim().length > 0
    || value.status.length > 0
    || value.type.length > 0
    || value.labelId.length > 0
    || value.epicId.length > 0
    || value.assignee.length > 0
  );
}

export function applyPlanningStoryFilters<T extends PlanningStoryFilterItem>(
  stories: readonly T[],
  filters: PlanningFiltersValue,
): T[] {
  const normalizedSearch = filters.search.trim().toLowerCase();

  return stories.filter((story) => {
    if (normalizedSearch.length > 0) {
      const key = (story.key ?? "").toLowerCase();
      const title = story.title.toLowerCase();
      if (!key.includes(normalizedSearch) && !title.includes(normalizedSearch)) {
        return false;
      }
    }

    if (filters.status.length > 0 && story.status !== filters.status) {
      return false;
    }

    if (filters.type.length > 0 && story.story_type !== filters.type) {
      return false;
    }

    if (filters.labelId.length > 0) {
      const hasLabel = (story.labels ?? []).some((label) => label.id === filters.labelId);
      if (!hasLabel) {
        return false;
      }
    }

    if (filters.epicId.length > 0 && story.epic_id !== filters.epicId) {
      return false;
    }

    if (filters.assignee.length > 0) {
      const assigneeId = normalizeAssigneeId(story);
      if (filters.assignee === UNASSIGNED_FILTER_VALUE) {
        if (assigneeId !== null) {
          return false;
        }
      } else if (assigneeId !== filters.assignee) {
        return false;
      }
    }

    return true;
  });
}

export function buildStoryStatusOptions(
  stories: readonly Pick<PlanningStoryFilterItem, "status">[],
): PlanningFilterOption[] {
  return [...new Set(stories.map((story) => story.status))]
    .sort((a, b) => a.localeCompare(b))
    .map((status) => ({ value: status, label: normalizeLabel(status) }));
}

export function buildStoryTypeOptions(
  stories: readonly Pick<PlanningStoryFilterItem, "story_type">[],
): PlanningFilterOption[] {
  return [...new Set(stories.map((story) => story.story_type))]
    .sort((a, b) => a.localeCompare(b))
    .map((type) => ({ value: type, label: normalizeLabel(type) }));
}

export function buildStoryLabelOptions(
  stories: readonly Pick<PlanningStoryFilterItem, "labels">[],
): PlanningFilterOption[] {
  const labelsById = new Map<string, string>();
  for (const story of stories) {
    for (const label of story.labels ?? []) {
      if (!labelsById.has(label.id)) {
        labelsById.set(label.id, label.name ?? label.id);
      }
    }
  }

  return [...labelsById.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function buildStoryEpicOptions(
  stories: readonly Pick<PlanningStoryFilterItem, "epic_id" | "epic_key" | "epic_title">[],
): PlanningFilterOption[] {
  const epicsById = new Map<string, string>();

  for (const story of stories) {
    if (!story.epic_id) {
      continue;
    }

    const key = story.epic_key?.trim();
    const title = story.epic_title?.trim();
    if (key && title) {
      epicsById.set(story.epic_id, `${key} ${title}`);
      continue;
    }

    if (key) {
      epicsById.set(story.epic_id, key);
      continue;
    }

    if (title) {
      epicsById.set(story.epic_id, title);
      continue;
    }

    epicsById.set(story.epic_id, story.epic_id);
  }

  return [...epicsById.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

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
