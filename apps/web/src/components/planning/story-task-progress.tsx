import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

function normalizeCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

export function StoryTaskProgress({
  doneCount,
  totalCount,
  hideWhenZero = true,
  className,
}: {
  doneCount: number;
  totalCount: number;
  hideWhenZero?: boolean;
  className?: string;
}) {
  const total = normalizeCount(totalCount);
  const done = Math.min(normalizeCount(doneCount), total);

  if (hideWhenZero && total === 0) return null;

  const isComplete = total > 0 && done === total;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground",
        isComplete && "text-emerald-400",
        className,
      )}
    >
      <CheckCircle2 className="size-3" />
      {done}/{total}
    </span>
  );
}
