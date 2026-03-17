import { GitBranch, RotateCcw, Siren, Skull } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { FailureCategory } from "./timeline-view-model";

export interface FailureBadgeProps {
  category: FailureCategory | null;
}

export function FailureBadge({ category }: FailureBadgeProps) {
  if (category === "WATCHDOG") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] border-amber-400/30 bg-amber-500/10 text-amber-100"
      >
        <Siren className="mr-1 size-3" />
        Watchdog
      </Badge>
    );
  }
  if (category === "RETRY") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] border-blue-400/30 bg-blue-500/10 text-blue-100"
      >
        <RotateCcw className="mr-1 size-3" />
        Retry
      </Badge>
    );
  }
  if (category === "DEAD_LETTER") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] border-red-500/30 bg-red-500/15 text-red-100"
      >
        <Skull className="mr-1 size-3" />
        Dead letter
      </Badge>
    );
  }
  if (category === "TRANSITION_REJECTED") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] border-red-400/30 bg-red-500/10 text-red-100"
      >
        <GitBranch className="mr-1 size-3" />
        Rejected
      </Badge>
    );
  }
  return null;
}
