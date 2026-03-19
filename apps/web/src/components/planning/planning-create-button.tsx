"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface PlanningCreateButtonProps {
  tooltip: string;
  disabled?: boolean;
  onClick: () => void;
}

export function PlanningCreateButton({
  tooltip,
  disabled = false,
  onClick,
}: PlanningCreateButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={onClick}
            className="gap-1.5 whitespace-nowrap"
          >
            <Plus className="size-3.5" />
            Create
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
