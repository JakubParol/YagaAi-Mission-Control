import { Badge } from "@/components/ui/badge";
import type { TaskState } from "@/lib/types";

const STATE_VARIANTS: Record<TaskState, string> = {
  PLANNED: "bg-neutral-700 text-neutral-200 hover:bg-neutral-600",
  ASSIGNED: "bg-blue-900 text-blue-200 hover:bg-blue-800",
  DONE: "bg-green-900 text-green-200 hover:bg-green-800",
  BLOCKED: "bg-red-900 text-red-200 hover:bg-red-800",
};

export function StateBadge({ state }: { state: TaskState }) {
  return (
    <Badge variant="secondary" className={STATE_VARIANTS[state]}>
      {state}
    </Badge>
  );
}
