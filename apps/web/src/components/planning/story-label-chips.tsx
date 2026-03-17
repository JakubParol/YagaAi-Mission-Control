import type { CSSProperties } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { StoryLabel } from "@/lib/planning/types";
import { cn } from "@/lib/utils";

export type { StoryLabel } from "@/lib/planning/types";

interface StoryLabelChipsProps {
  labels: StoryLabel[] | null | undefined;
  maxVisible?: number;
  className?: string;
  chipClassName?: string;
  allNamesTooltip?: boolean;
}

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizeHexColor(color: string): string | null {
  if (!HEX_COLOR_RE.test(color)) return null;
  if (color.length === 7) return color.toLowerCase();

  const [r, g, b] = color.slice(1).split("");
  return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
}

export function toLabelChipStyle(color: string | null): CSSProperties | undefined {
  const normalized = normalizeHexColor(color?.trim() ?? "");
  if (!normalized) return undefined;

  return {
    color: normalized,
    borderColor: `${normalized}66`,
    backgroundColor: `${normalized}1a`,
  };
}

export function StoryLabelChips({
  labels,
  maxVisible = 2,
  className,
  chipClassName,
  allNamesTooltip = false,
}: StoryLabelChipsProps) {
  if (!labels || labels.length === 0) return null;

  const { visible, overflowCount } = splitVisibleStoryLabels(labels, maxVisible);
  const allNames = labels.map((label) => label.name).join(", ");
  const chips = (
    <div className={cn("flex min-w-0 items-center gap-1 overflow-hidden", className)}>
      {visible.map((label) => (
        <Tooltip key={label.id}>
          <TooltipTrigger asChild>
            <span
              style={toLabelChipStyle(label.color)}
              className={cn(
                "inline-flex min-w-0 max-w-[9rem] items-center rounded-full border border-border/50 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground",
                "truncate",
                chipClassName,
              )}
            >
              {label.name}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{label.name}</TooltipContent>
        </Tooltip>
      ))}
      {overflowCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0 items-center rounded-full border border-border/50 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              +{overflowCount}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{allNames}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );

  if (!allNamesTooltip) return chips;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{chips}</TooltipTrigger>
      <TooltipContent side="bottom">{allNames}</TooltipContent>
    </Tooltip>
  );
}

export function splitVisibleStoryLabels(
  labels: readonly StoryLabel[],
  maxVisible: number,
): { visible: StoryLabel[]; overflowCount: number } {
  const normalizedMax = Math.max(maxVisible, 0);
  const visible = labels.slice(0, normalizedMax);
  return {
    visible,
    overflowCount: Math.max(labels.length - visible.length, 0),
  };
}
