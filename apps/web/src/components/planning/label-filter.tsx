"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Tags, X } from "lucide-react";

import { apiUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { usePlanningFilter } from "./planning-filter-context";

interface LabelItem {
  id: string;
  name: string;
  color: string | null;
}

function toColorDotStyle(color: string | null): { backgroundColor?: string } {
  const value = color?.trim();
  if (!value) return {};
  return { backgroundColor: value };
}

export function LabelFilter() {
  const { selectedLabelIds, toggleLabel, clearLabels, singleProjectId } = usePlanningFilter();
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<LabelItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!singleProjectId) {
      setLabels([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(apiUrl(`/v1/planning/labels?project_id=${singleProjectId}&limit=100`))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((json) => {
        if (cancelled) return;
        setLabels((json.data ?? []) as LabelItem[]);
      })
      .catch(() => {
        if (!cancelled) setLabels([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [singleProjectId]);

  const selectedCount = selectedLabelIds.length;
  const triggerLabel = useMemo(() => {
    if (!singleProjectId) return "Labels";
    if (loading) return "Labels...";
    if (selectedCount === 0) return "Filter labels";
    if (selectedCount === 1) return "1 label";
    return `${selectedCount} labels`;
  }, [loading, selectedCount, singleProjectId]);

  const selectedSet = useMemo(() => new Set(selectedLabelIds), [selectedLabelIds]);
  const canClear = selectedCount > 0;

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            role="combobox"
            aria-expanded={open}
            disabled={!singleProjectId}
            className="gap-1.5 text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            <Tags className="size-3.5" />
            <span className="max-w-[120px] truncate text-xs">{triggerLabel}</span>
            <ChevronsUpDown className="size-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search labels..." className="h-8 text-xs" />
            <CommandList>
              <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
                No labels found.
              </CommandEmpty>
              <CommandGroup>
                {labels.map((label) => (
                  <CommandItem
                    key={label.id}
                    value={label.name}
                    onSelect={() => toggleLabel(label.id)}
                    className="text-xs"
                  >
                    <Check
                      className={cn(
                        "mr-2 size-3.5",
                        selectedSet.has(label.id) ? "opacity-100 text-primary" : "opacity-0",
                      )}
                    />
                    <span
                      className="mr-1.5 inline-flex size-2 rounded-full border border-border/60"
                      style={toColorDotStyle(label.color)}
                      aria-hidden
                    />
                    <span className="truncate">{label.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        title="Clear label filters"
        disabled={!canClear}
        aria-label="Clear label filters"
        onClick={clearLabels}
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}
