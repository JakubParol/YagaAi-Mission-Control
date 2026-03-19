"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PlanningControlBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  onClear: () => void;
  clearDisabled?: boolean;
  disabled?: boolean;
  createAction?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PlanningControlBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  onClear,
  clearDisabled = false,
  disabled = false,
  createAction,
  children,
  className,
}: PlanningControlBarProps) {
  return (
    <div className={cn("flex w-full items-center gap-2", className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2 py-1.5 sm:flex-nowrap">
        <div className="relative min-w-[150px] shrink flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
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

        {children}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || clearDisabled}
          onClick={onClear}
        >
          Clear
        </Button>
      </div>

      {createAction}
    </div>
  );
}
