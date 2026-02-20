import { cn } from "@/lib/utils";
import type { TaskState } from "@/lib/types";

export const STATE_STYLES: Record<TaskState, string> = {
  BACKLOG: "bg-slate-500/15 text-slate-400 border-slate-500/20",
  PLANNED: "bg-gray-500/15 text-gray-400 border-gray-500/20",
  ASSIGNED: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  DONE: "bg-green-500/15 text-green-400 border-green-500/20",
  BLOCKED: "bg-red-500/15 text-red-400 border-red-500/20",
};

export const STATE_LABELS: Record<TaskState, string> = {
  BACKLOG: "Backlog",
  PLANNED: "Planned",
  ASSIGNED: "Assigned",
  DONE: "Done",
  BLOCKED: "Blocked",
};

export function StateBadge({ state }: { state: TaskState }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STATE_STYLES[state]
      )}
    >
      {STATE_LABELS[state]}
    </span>
  );
}
