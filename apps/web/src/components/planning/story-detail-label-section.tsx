"use client";

import { useMemo } from "react";
import { Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ThemedSelect,
  type ThemedSelectOption,
} from "@/components/ui/themed-select";
import type { WorkItemLabel } from "@/lib/planning/types";
import { toLabelChipStyle } from "./story-label-chips";

// ── StoryLabelManager ───────────────────────────────────────────────────────

export interface StoryLabelManagerProps {
  labels: WorkItemLabel[];
  availableLabels: WorkItemLabel[];
  selectedLabelId: string;
  isLoading: boolean;
  pendingLabelIds: ReadonlySet<string>;
  error: string | null;
  onSelectLabel: (labelId: string) => void;
  onAttachLabel: () => void;
  onDetachLabel: (labelId: string) => void;
}

export function StoryLabelManager({
  labels,
  availableLabels,
  selectedLabelId,
  isLoading,
  pendingLabelIds,
  error,
  onSelectLabel,
  onAttachLabel,
  onDetachLabel,
}: StoryLabelManagerProps) {
  const attachedSet = useMemo(() => new Set(labels.map((label) => label.id)), [labels]);
  const attachableLabels = useMemo(
    () => availableLabels.filter((label) => !attachedSet.has(label.id)),
    [attachedSet, availableLabels],
  );
  const attachableOptions = useMemo<ThemedSelectOption[]>(
    () => attachableLabels.map((label) => ({ value: label.id, label: label.name })),
    [attachableLabels],
  );
  const canAttach = selectedLabelId !== "" && !pendingLabelIds.has(selectedLabelId);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50">
          Labels
        </span>
        {isLoading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
      </div>

      {error && (
        <p className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">
          {error}
        </p>
      )}

      {labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {labels.map((label) => (
            <button
              key={label.id}
              type="button"
              disabled={pendingLabelIds.has(label.id)}
              onClick={() => onDetachLabel(label.id)}
              style={toLabelChipStyle(label.color)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground",
                "disabled:cursor-wait disabled:opacity-70",
              )}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="max-w-[10rem] truncate">{label.name}</span>
                </TooltipTrigger>
                <TooltipContent side="bottom">{`Detach "${label.name}"`}</TooltipContent>
              </Tooltip>
              {pendingLabelIds.has(label.id) ? (
                <Loader2 className="size-2.5 animate-spin" />
              ) : (
                <X className="size-2.5" />
              )}
            </button>
          ))}
        </div>
      )}

      {labels.length === 0 && !isLoading && (
        <p className="mb-2 text-[11px] italic text-muted-foreground/50">No labels attached.</p>
      )}

      <div className="flex gap-1.5">
        <ThemedSelect
          value={selectedLabelId}
          options={attachableOptions}
          placeholder={attachableLabels.length === 0 ? "No labels to add" : "Add label\u2026"}
          disabled={isLoading || attachableLabels.length === 0}
          onValueChange={onSelectLabel}
          triggerClassName="h-7 text-xs flex-1"
        />
        <Button
          type="button"
          size="xs"
          disabled={!canAttach}
          onClick={onAttachLabel}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
