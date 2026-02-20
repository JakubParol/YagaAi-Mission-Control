import type { TaskState } from "@/lib/types";

const STATE_STYLES: Record<TaskState, string> = {
  BACKLOG: "bg-slate-500/15 text-slate-400 border-slate-500/20",
  PLANNED: "bg-gray-500/15 text-gray-400 border-gray-500/20",
  ASSIGNED: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  DONE: "bg-green-500/15 text-green-400 border-green-500/20",
  BLOCKED: "bg-red-500/15 text-red-400 border-red-500/20",
};

const STATE_LABELS: Record<TaskState, string> = {
  BACKLOG: "Backlog",
  PLANNED: "Planned",
  ASSIGNED: "Assigned",
  DONE: "Done",
  BLOCKED: "Blocked",
};

export function TaskCountBadges({
  counts,
}: {
  counts: Record<TaskState, number>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(counts) as TaskState[]).map((state) => (
        <span
          key={state}
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATE_STYLES[state]}`}
        >
          {STATE_LABELS[state]}: {counts[state]}
        </span>
      ))}
    </div>
  );
}
