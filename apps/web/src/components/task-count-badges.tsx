import { cn } from "@/lib/utils";
import { TASK_STATES } from "@/lib/types";
import type { TaskState } from "@/lib/types";
import { STATE_STYLES, STATE_LABELS } from "./state-badge";

export function TaskCountBadges({
  counts,
}: {
  counts: Record<TaskState, number>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TASK_STATES.map((state) => (
        <span
          key={state}
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
            STATE_STYLES[state]
          )}
        >
          {STATE_LABELS[state]}: {counts[state]}
        </span>
      ))}
    </div>
  );
}
