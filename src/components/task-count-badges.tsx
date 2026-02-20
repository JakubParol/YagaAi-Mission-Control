import { Badge } from "@/components/ui/badge";
import type { TaskState } from "@/lib/types";

const STATE_COLORS: Record<TaskState, string> = {
  PLANNED: "bg-neutral-700 text-neutral-200",
  ASSIGNED: "bg-blue-900 text-blue-200",
  DONE: "bg-green-900 text-green-200",
  BLOCKED: "bg-red-900 text-red-200",
};

export function TaskCountBadges({
  counts,
}: {
  counts: Record<TaskState, number>;
}) {
  return (
    <div className="flex gap-2">
      {(Object.keys(counts) as TaskState[]).map((state) => (
        <Badge key={state} variant="secondary" className={STATE_COLORS[state]}>
          {state[0]}:{counts[state]}
        </Badge>
      ))}
    </div>
  );
}
