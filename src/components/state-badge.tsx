import type { TaskState } from "@/lib/types";

const STATE_STYLES: Record<TaskState, string> = {
  BACKLOG: "bg-slate-500/15 text-slate-400 border border-slate-500/20",
  PLANNED: "bg-gray-500/15 text-gray-400 border border-gray-500/20",
  ASSIGNED: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  DONE: "bg-green-500/15 text-green-400 border border-green-500/20",
  BLOCKED: "bg-red-500/15 text-red-400 border border-red-500/20",
};

const STATE_LABELS: Record<TaskState, string> = {
  BACKLOG: "Backlog",
  PLANNED: "Planned",
  ASSIGNED: "Assigned",
  DONE: "Done",
  BLOCKED: "Blocked",
};

export function StateBadge({ state }: { state: TaskState }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_STYLES[state]}`}
    >
      {STATE_LABELS[state]}
    </span>
  );
}
